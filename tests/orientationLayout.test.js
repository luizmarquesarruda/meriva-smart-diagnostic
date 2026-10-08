const assert = require('node:assert/strict');
const fs = require('node:fs');

const appJson = JSON.parse(fs.readFileSync('app.json', 'utf8'));
const index = fs.readFileSync('app/index.tsx', 'utf8');
const layout = fs.readFileSync('app/_layout.tsx', 'utf8');
const midLayout = fs.readFileSync('src/ui/midLayout.ts', 'utf8');

// Expo's default orientation means no orientation lock; do not introduce a native portrait/landscape lock.
assert.equal(appJson.expo.orientation, 'default');
assert.match(index, /useWindowDimensions/);
assert.match(index, /layout\.landscape/);
assert.match(index, /contentContainerStyle/);
assert.match(index, /flexGrow:1/);
assert.match(index, /maxContentWidth/);
assert.match(index, /statusGridLandscape/);
assert.match(index, /actionGridLandscape/);
assert.match(index, /react-native-safe-area-context/);
assert.match(layout, /SafeAreaProvider/);
assert.match(midLayout, /size\.width > size\.height/);
assert.doesNotMatch(index, /screenOrientation|OrientationLock\.(PORTRAIT|LANDSCAPE)/);

console.log('Rotação livre e proteção responsiva: OK');
