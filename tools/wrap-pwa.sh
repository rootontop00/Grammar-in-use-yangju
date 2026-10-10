#!/bin/sh
# usage: wrap-pwa.sh fragment.html out.html — standalone page plus install/offline tags for the hosted copy
{
  printf '<!DOCTYPE html>\n<html lang="ko">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<meta name="description" content="예비 초등학생을 위한 한글 자음·모음·글자 획순 따라 쓰기 연습">\n'
  printf '<link rel="manifest" href="manifest.webmanifest">\n<meta name="theme-color" content="#2B8A5F">\n<link rel="icon" type="image/png" sizes="192x192" href="icon-192.png">\n<link rel="apple-touch-icon" href="apple-touch-icon.png">\n<meta name="mobile-web-app-capable" content="yes">\n<meta name="apple-mobile-web-app-capable" content="yes">\n<meta name="apple-mobile-web-app-title" content="획순 공책">\n<meta name="apple-mobile-web-app-status-bar-style" content="default">\n'
  printf '<script>if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));</script>\n'
  printf '<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}</style>\n'
  awk 'BEGIN{h=1} { if(h){print} else {buf=buf $0 "\n"} if(h && /^<\/style>/){h=0; print "</head>\n<body>"} } END{printf "%s", buf}' "$1"
  printf '</body>\n</html>\n'
} > "$2"
