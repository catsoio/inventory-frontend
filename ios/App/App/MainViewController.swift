import Capacitor
import UIKit
import Vision

/// Appens bro-vy. Den registrerar de plugin som ligger i själva appen (inte i node_modules).
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(PlateReaderPlugin())
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
