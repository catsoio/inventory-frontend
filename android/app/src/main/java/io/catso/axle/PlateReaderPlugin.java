package io.catso.axle;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

/**
 * Läser text ur en bildruta med Googles ML Kit (modellen följer med appen, så det fungerar utan
 * nät). Webbvyn skickar bildrutor från den levande kameran flera gånger i sekunden; svaret är
 * textraderna, och registreringsnumret plockas ut i webbkoden (`core/scan/plate.ts`).
 * Samma namn och svar som iOS-pluginet i `MainViewController.swift`.
 */
@CapacitorPlugin(name = "PlateReader")
public class PlateReaderPlugin extends Plugin {

    private TextRecognizer recognizer;

    @Override
    public void load() {
        recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
    }

    @PluginMethod
    public void recognize(PluginCall call) {
        String data = call.getString("image");
        if (data == null || data.isEmpty()) {
            call.reject("image must be a base64 encoded JPEG");
            return;
        }
        Bitmap bitmap;
        try {
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        } catch (IllegalArgumentException e) {
            call.reject("image is not valid base64");
            return;
        }
        if (bitmap == null) {
            call.reject("image could not be decoded");
            return;
        }
        recognizer
            .process(InputImage.fromBitmap(bitmap, 0))
            .addOnSuccessListener(text -> {
                JSArray lines = new JSArray();
                for (Text.TextBlock block : text.getTextBlocks()) {
                    for (Text.Line line : block.getLines()) {
                        lines.put(line.getText());
                    }
                }
                JSObject result = new JSObject();
                result.put("lines", lines);
                call.resolve(result);
            })
            .addOnFailureListener(e -> call.reject(e.getMessage() == null ? "recognition failed" : e.getMessage()));
    }
}
