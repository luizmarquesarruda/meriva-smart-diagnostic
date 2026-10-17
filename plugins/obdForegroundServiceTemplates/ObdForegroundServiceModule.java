package __APP_PACKAGE__.obd;

import android.content.Intent;
import android.os.Build;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

/** React Native bridge for the OBD session foreground-service lifecycle. */
public final class ObdForegroundServiceModule extends ReactContextBaseJavaModule {
  public ObdForegroundServiceModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return "ObdForegroundService";
  }

  @ReactMethod
  public void start(String adapterName, Promise promise) {
    try {
      Intent intent = new Intent(getReactApplicationContext(), ObdForegroundService.class);
      intent.setAction(ObdForegroundService.ACTION_START);
      intent.putExtra(ObdForegroundService.EXTRA_ADAPTER_NAME, adapterName == null ? "ELM327" : adapterName);

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        getReactApplicationContext().startForegroundService(intent);
      } else {
        getReactApplicationContext().startService(intent);
      }
      // This confirms the Android start request was accepted, not that the
      // real OBD polling has moved out of JavaScript.
      promise.resolve(true);
    } catch (SecurityException error) {
      promise.reject("OBD_FOREGROUND_SERVICE_PERMISSION", error);
    } catch (RuntimeException error) {
      promise.reject("OBD_FOREGROUND_SERVICE_START_FAILED", error);
    }
  }

  @ReactMethod
  public void stop(Promise promise) {
    try {
      Intent intent = new Intent(getReactApplicationContext(), ObdForegroundService.class);
      intent.setAction(ObdForegroundService.ACTION_STOP);
      getReactApplicationContext().stopService(intent);
      promise.resolve(true);
    } catch (RuntimeException error) {
      promise.reject("OBD_FOREGROUND_SERVICE_STOP_FAILED", error);
    }
  }

  @ReactMethod
  public void isRunning(Promise promise) {
    promise.resolve(ObdForegroundService.isRunning());
  }
}
