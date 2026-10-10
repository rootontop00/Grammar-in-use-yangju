#!/bin/sh
# usage: extract-fragment.sh hangul/index.html out.html
# Turns the hosted page back into the artifact fragment (no doctype/head/body, no install tags):
# keeps everything from the page's own <title> up to </head>, then the body content.
awk '
  /^<title>/ { inhead = 1 }
  /^<\/head>/ { inhead = 0; next }
  /^<body>/ { inbody = 1; next }
  /^<\/body>/ { inbody = 0; next }
  inhead || inbody { print }
' "$1" > "$2"
