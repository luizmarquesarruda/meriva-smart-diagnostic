#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PREFIX="${PREFIX:-/data/data/com.termux/files/usr}"

find_java17() {
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
      17.*)
        printf '%s\n' "$candidate"
        return 0
        ;;
    esac
  done

  return 1
}

JAVA17_BIN="$(find_java17 || true)"

if [ -z "$JAVA17_BIN" ]; then
  echo "ERRO: Java 17 não foi encontrado no Termux."
  echo
  echo "Instale o JDK 17 e tente novamente:"
  echo "  pkg update"
  echo "  pkg install openjdk-17"
  echo
  echo "Depois confira:"
  echo "  '${PREFIX}/lib/jvm/*/bin/java' -version"
  exit 1
fi

export JAVA_HOME="$(cd "$(dirname "$JAVA17_BIN")/.." && pwd)"
export PATH="$JAVA_HOME/bin:$PATH"

echo "===== MERIVA SMART DIAGNOSTIC / ANDROID ====="
echo "JAVA_HOME=$JAVA_HOME"
java -version
echo

if [ ! -x "$ROOT/android/gradlew" ]; then
  echo "ERRO: projeto Android não encontrado."
  echo "Execute antes:"
  echo "  npx expo prebuild --platform android --non-interactive"
  exit 1
fi

cd "$ROOT/android"
./gradlew :app:assembleDebug --no-daemon --stacktrace

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
