#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PREFIX="${PREFIX:-/data/data/com.termux/files/usr}"

find_termux_java() {
  local candidate version
  local candidates=()

  if [ -n "${JAVA_HOME:-}" ] && [ -x "${JAVA_HOME}/bin/java" ]; then
    candidates+=( "${JAVA_HOME}/bin/java" )
  fi

  if [ -d "${PREFIX}/lib/jvm" ]; then
    while IFS= read -r candidate; do
      candidates+=( "$candidate" )
    done < <(find "${PREFIX}/lib/jvm" -type f -path '*/bin/java' -perm -u+x 2>/dev/null | sort)
  fi

  candidates+=( "${PREFIX}/bin/java" )

  for candidate in "${candidates[@]}"; do
    [ -x "$candidate" ] || continue
    version="$( "$candidate" -version 2>&1 | awk -F '"' '/version "/ {print $2; exit}' )"
    case "$version" in
      21.*|25.*)
        printf '%s\n' "$candidate"
        return 0
        ;;
    esac
  done

  return 1
}

JAVA_BIN="$(find_termux_java || true)"

if [ -z "$JAVA_BIN" ]; then
  echo "ERRO: nenhum JDK compatível foi encontrado no Termux."
  echo
  echo "O Termux atual fornece OpenJDK 21/25. Instale o OpenJDK 21:"
  echo "  pkg update"
  echo "  pkg install openjdk-21"
  echo
  echo "Depois confira:"
  echo "  '${PREFIX}/lib/jvm/*/bin/java' -version"
  exit 1
fi

export JAVA_HOME="$(cd "$(dirname "$JAVA_BIN")/.." && pwd)"
export PATH="$JAVA_HOME/bin:$PATH"

echo "===== MERIVA SMART DIAGNOSTIC / ANDROID ====="
echo "JAVA_HOME=$JAVA_HOME"
java -version
echo

if [ ! -x "$ROOT/android/gradlew" ]; then
  echo "Android nativo não encontrado. Gerando com Expo prebuild..."
  cd "$ROOT"
  npx expo prebuild --platform android --non-interactive
fi

cd "$ROOT/android"
./gradlew :app:assembleDebug --no-daemon --stacktrace -Dorg.gradle.java.home="$JAVA_HOME"

APK="$ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
if [ -f "$APK" ]; then
  echo
  echo "BUILD OK"
  echo "APK: $APK"
  if command -v sha256sum >/dev/null 2>&1; then
    echo "SHA256: $(sha256sum "$APK" | awk '{print $1}')"
  fi
else
  echo "ERRO: Gradle terminou sem gerar o APK esperado."
  exit 1
fi
