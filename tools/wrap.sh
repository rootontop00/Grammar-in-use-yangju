#!/bin/sh
# usage: wrap.sh fragment.html out.html  — adds the document skeleton the artifact host would add
{
  printf '<!DOCTYPE html>\n<html lang="ko">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<meta name="description" content="예비 초등학생을 위한 한글 자음·모음·글자 획순 따라 쓰기 연습">\n<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}</style>\n'
  # head part: everything up to and including </style> of the fragment's first style block
  awk 'BEGIN{h=1} { if(h){print} else {buf=buf $0 "\n"} if(h && /^<\/style>/){h=0; print "</head>\n<body>"} } END{printf "%s", buf}' "$1"
  printf '</body>\n</html>\n'
} > "$2"
