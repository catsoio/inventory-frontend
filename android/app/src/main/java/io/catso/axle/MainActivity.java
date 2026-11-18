package io.catso.axle;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugin som ligger i själva appen (inte i node_modules) måste registreras före super.
        registerPlugin(PlateReaderPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
