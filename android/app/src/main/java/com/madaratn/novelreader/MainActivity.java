package com.madaratn.novelreader;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Video engine (android/engine): http://127.0.0.1:4567, like on the PC.
        nr.engine.Engine.INSTANCE.start(getApplication());
    }
}
