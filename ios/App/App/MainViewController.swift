import Capacitor
import UIKit
import Vision
import iZettleSDK

/// Appens bro-vy. Den registrerar de plugin som ligger i själva appen (inte i node_modules).
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(PlateReaderPlugin())
        bridge?.registerPluginInstance(PayPalReaderPlugin())
    }
}

/// Zettles Payments SDK: telefonen pratar med PayPal Reader över Bluetooth och skickar beloppet
/// dit. Client ID och redirect-adressen kommer från Zettles utvecklarportal och står i Info.plist
/// (`ZettleClientID`, `ZettleCallbackURL`); utan Client ID är läsaren inte inställd och inget startas.
@objc(PayPalReaderPlugin)
public class PayPalReaderPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PayPalReaderPlugin"
    public let jsName = "PayPalReader"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "login", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "settings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "charge", returnType: CAPPluginReturnPromise),
    ]

    private var started = false

    /// SDK:n startas en gång, första gången något behöver den.
    private func startIfConfigured() -> Bool {
        if started { return true }
        let info = Bundle.main.infoDictionary
        guard let clientID = info?["ZettleClientID"] as? String, !clientID.isEmpty,
              let callback = (info?["ZettleCallbackURL"] as? String).flatMap(URL.init(string:)) else {
            return false
        }
        do {
            let auth = try iZettleSDKAuthorization(clientID: clientID, callbackURL: callback)
            iZettleSDK.shared().start(with: auth)
            started = true
        } catch {
            return false
        }
        return true
    }

    @objc func status(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let configured = self.startIfConfigured()
            call.resolve([
                "configured": configured,
                "loggedIn": configured && iZettleSDK.shared().isLoggedIn,
            ])
        }
    }

    @objc func login(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.startIfConfigured(), let vc = self.bridge?.viewController else {
                call.reject("NOT_CONFIGURED")
                return
            }
            iZettleSDK.shared().performLogin(from: vc) { error in
                if let error = error { call.reject(error.localizedDescription) } else { call.resolve() }
            }
        }
    }

    @objc func settings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.startIfConfigured(), let vc = self.bridge?.viewController else {
                call.reject("NOT_CONFIGURED")
                return
            }
            let config = IZSDKSettingsConfiguration(paypalReaderTippingSettingsEnabled: false)
            iZettleSDK.shared().presentSettings(from: vc, configuration: config)
            call.resolve()
        }
    }

    /// Beloppet i kronor som text ("10.00"), så att inga flyttal rundar fel på vägen.
    @objc func charge(_ call: CAPPluginCall) {
        guard let text = call.getString("amount"), let reference = call.getString("reference") else {
            call.reject("amount and reference are required")
            return
        }
        let amount = NSDecimalNumber(string: text, locale: Locale(identifier: "en_US_POSIX"))
        if amount == NSDecimalNumber.notANumber || amount.compare(NSDecimalNumber.zero) != .orderedDescending {
            call.reject("amount must be a positive number")
            return
        }
        DispatchQueue.main.async {
            guard self.startIfConfigured(), let vc = self.bridge?.viewController else {
                call.reject("NOT_CONFIGURED")
                return
            }
            // Ingen dricks: beloppet ska vara exakt säljkortets.
            let tipping = IZSDKTippingConfiguration(
                zettleReaderTippingStyle: .none, paypalReaderTippingStyle: .none)
            iZettleSDK.shared().charge(
                amount, tippingConfiguration: tipping, reference: reference,
                payPalPartnerPayeePricingTierId: nil, presentFrom: vc
            ) { info, error in
                if let error = error {
                    call.reject(error.localizedDescription, nil, error)
                    return
                }
                guard let info = info else {
                    call.reject("CANCELLED")
                    return
                }
                call.resolve([
                    "reference": reference,
                    "amount": info.amount.stringValue,
                    "transactionId": info.transactionId,
                    "cardBrand": info.cardBrand,
                    "maskedPan": info.obfuscatedPan,
                ])
            }
        }
    }
}

/// Läser text ur en bildruta med Apples egna Vision, utan bibliotek från tredje part. Webbvyn skickar
/// bildrutor från den levande kameran flera gånger i sekunden; svaret är textraderna, och
/// registreringsnumret plockas ut i webbkoden (`core/scan/plate.ts`).
@objc(PlateReaderPlugin)
public class PlateReaderPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PlateReaderPlugin"
    public let jsName = "PlateReader"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "recognize", returnType: CAPPluginReturnPromise)
    ]

    @objc func recognize(_ call: CAPPluginCall) {
        guard let base64 = call.getString("image"),
              let data = Data(base64Encoded: base64),
              let cgImage = UIImage(data: data)?.cgImage else {
            call.reject("image must be a base64 encoded JPEG")
            return
        }
        let request = VNRecognizeTextRequest { request, error in
            if let error = error {
                call.reject(error.localizedDescription)
                return
            }
            let observations = (request.results as? [VNRecognizedTextObservation]) ?? []
            let lines = observations.compactMap { $0.topCandidates(1).first?.string }
            call.resolve(["lines": lines])
        }
        // Skyltar är korta kodord, inte språk: rättning mot ordlista gör dem bara sämre.
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = false
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                try VNImageRequestHandler(cgImage: cgImage, options: [:]).perform([request])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }
}
