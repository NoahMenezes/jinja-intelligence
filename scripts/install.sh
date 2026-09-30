#!/bin/sh
# Install jinja-intelligence via curl (no global npm/bun/pnpm/yarn install).
# Needs: curl + tar + node >= 18 (node ships npm, used once for prod deps).
#
#   curl -fsSL https://raw.githubusercontent.com/NoahMenezes/jinja-intelligence/main/scripts/install.sh | sh
#   curl -fsSL .../install.sh | sh -s -- 1.0.0            # pin a version
#   PREFIX=$HOME/.local sh install.sh                     # default
#   PREFIX=/usr/local sudo sh install.sh                  # system-wide
#
# Layout: $PREFIX/share/jinja-intelligence/<files> + $PREFIX/bin/jinja-intelligence shim.
set -eu

REPO="NoahMenezes/jinja-intelligence"
PKG="jinja-intelligence"
VERSION="${1:-${VERSION:-latest}}"
PREFIX="${PREFIX:-$HOME/.local}"
DEST="$PREFIX/share/$PKG"
BIN="$PREFIX/bin/$PKG"

need() { command -v "$1" >/dev/null 2>&1 || { echo "error: $1 is required" >&2; exit 1; }; }
need curl
need node
need tar

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "error: node >= 18 required (found $(node --version))" >&2
  exit 1
fi

if [ "$VERSION" = "latest" ]; then
  # Registry JSON is ~100KB; extract version without jq (node is guaranteed here).
  VERSION="$(curl -fsSL "https://registry.npmjs.org/$PKG/latest" | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).version")"
  echo "resolving latest -> $VERSION"
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT INT TERM
TARBALL_URL="https://registry.npmjs.org/$PKG/-/$PKG-$VERSION.tgz"
echo "downloading $TARBALL_URL"
curl -fsSL "$TARBALL_URL" -o "$TMP/pkg.tgz"
tar -xzf "$TMP/pkg.tgz" -C "$TMP"
# npm tarballs nest under package/
mkdir -p "$(dirname "$DEST")"
rm -rf "$DEST"
mv "$TMP/package" "$DEST"

# The npm tarball ships dist/ but not node_modules. Install prod deps only.
# npm ships with node, so this keeps the one-liner curl-only (no global install).
if command -v npm >/dev/null 2>&1; then
  echo "installing runtime dependencies (npm --omit=dev)"
  npm install --prefix "$DEST" --omit=dev --no-audit --no-fund
else
  echo "warning: npm not found; server will fail without dependencies." >&2
  echo "install node 18+ (which includes npm) and re-run." >&2
fi

mkdir -p "$(dirname "$BIN")"
cat > "$BIN" <<EOF
#!/bin/sh
exec node "$DEST/dist/server.js" "\$@"
EOF
chmod +x "$BIN"

echo "installed $PKG $VERSION to $DEST"
echo "binary: $BIN"
"$BIN" --version
case ":$PATH:" in
  *":$(dirname "$BIN"):"*) ;;
  *) echo "note: $(dirname "$BIN") is not on PATH. Add: export PATH=\"$(dirname "$BIN"):\$PATH\"" >&2 ;;
esac
