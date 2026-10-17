package __APP_PACKAGE__.obd;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

/**
 * Holds a user-visible Android foreground-service lease while the app's
 * existing single-owner ELM327 session is active. The JS session remains the
 * owner of the Bluetooth socket and serial command queue.
 */
public final class ObdForegroundService extends Service {
  public static final String ACTION_START = "__APP_PACKAGE__.obd.action.START";
  public static final String ACTION_STOP = "__APP_PACKAGE__.obd.action.STOP";
  public static final String EXTRA_ADAPTER_NAME = "adapterName";

  private static final String TAG = "MerivaObdService";
  private static final String CHANNEL_ID = "meriva_obd_session";
  private static final int NOTIFICATION_ID = 41027;
  private static volatile boolean running = false;

  private String adapterName = "ELM327";

  public static boolean isRunning() {
    return running;
  }

  @Override
  public void onCreate() {
    super.onCreate();
    createNotificationChannel();
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    if (intent == null) {
      // Do not resurrect a stale "connected" notification without the JS
      // owner/session state that was lost with the app process.
      stopSelf(startId);
      return START_NOT_STICKY;
    }

    String action = intent.getAction();
    if (ACTION_STOP.equals(action)) {
      running = false;
      stopForeground(true);
      stopSelf(startId);
      return START_NOT_STICKY;
    }

    if (!ACTION_START.equals(action)) {
      stopSelf(startId);
      return START_NOT_STICKY;
    }

    String providedName = intent.getStringExtra(EXTRA_ADAPTER_NAME);
    if (providedName != null && !providedName.trim().isEmpty()) {
      adapterName = providedName.trim();
    }

    try {
      Notification notification = buildNotification();
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(
          NOTIFICATION_ID,
          notification,
          ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
        );
      } else {
        startForeground(NOTIFICATION_ID, notification);
      }
      running = true;
    } catch (SecurityException | IllegalArgumentException error) {
      running = false;
      Log.e(TAG, "Unable to promote OBD service to foreground", error);
      stopSelf(startId);
      return START_NOT_STICKY;
    }

    // START_STICKY keeps the running process prioritized while the ECU session
    // is active; a null restart intent is explicitly stopped above.
    return START_STICKY;
  }

  private Notification buildNotification() {
    String text = "Sessão OBD ativa pelo adaptador " + adapterName
      + ". Mantenha o adaptador conectado.";

    Notification.Builder builder;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      builder = new Notification.Builder(this, CHANNEL_ID);
    } else {
      builder = new Notification.Builder(this);
    }

    builder
      .setSmallIcon(android.R.drawable.stat_notify_sync)
      .setContentTitle("Meriva Smart Diagnostic")
      .setContentText(text)
      .setStyle(new Notification.BigTextStyle().bigText(text))
      .setCategory(Notification.CATEGORY_SERVICE)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setVisibility(Notification.VISIBILITY_PUBLIC);

    Intent launchIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
    if (launchIntent != null) {
      int flags = PendingIntent.FLAG_UPDATE_CURRENT;
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        flags |= PendingIntent.FLAG_IMMUTABLE;
      }
      PendingIntent pendingIntent = PendingIntent.getActivity(this, 0, launchIntent, flags);
      builder.setContentIntent(pendingIntent);
    }

    return builder.build();
  }

  private void createNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

    NotificationChannel channel = new NotificationChannel(
      CHANNEL_ID,
      "Sessão OBD ativa",
      NotificationManager.IMPORTANCE_LOW
    );
    channel.setDescription("Indica que o diagnóstico OBD está mantendo uma sessão ativa.");
    channel.setShowBadge(false);

    NotificationManager manager = getSystemService(NotificationManager.class);
    if (manager != null) {
      manager.createNotificationChannel(channel);
    }
  }

  @Override
  public void onDestroy() {
    running = false;
    stopForeground(true);
    super.onDestroy();
  }

  @Override
  public IBinder onBind(Intent intent) {
    return null;
  }
}
