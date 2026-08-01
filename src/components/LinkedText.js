import React from 'react';
import { Text, Linking, Alert } from 'react-native';

// http(s):// URLs, bare "www." URLs, and e-mail addresses.
const PATTERN = /((?:https?:\/\/|www\.)[^\s<>()"']+|[\w.+-]+@[\w-]+\.[\w.-]+)/gi;

// Punctuation that usually ENDS a sentence rather than belonging to the link,
// e.g. "see https://tapify.co.in." — the trailing dot isn't part of the URL.
const TRAILING = /[.,!?;:)\]}>]+$/;

const hrefFor = (token) => {
  if (/^https?:\/\//i.test(token)) return token;
  if (token.includes('@')) return `mailto:${token}`;
  return `https://${token}`;                       // bare www.…
};

const open = (token) => {
  const url = hrefFor(token);
  Linking.openURL(url).catch(() => Alert.alert('Could not open link', url));
};

/**
 * Renders text with any URLs / e-mails turned into tappable links.
 * Drop-in replacement for <Text> — same style prop, plus `linkStyle`.
 */
export default function LinkedText({ children, style, linkStyle, ...rest }) {
  const text = typeof children === 'string' ? children : String(children ?? '');

  const parts = [];
  let last = 0;
  let m;
  PATTERN.lastIndex = 0;                            // regex is module-level + /g
  while ((m = PATTERN.exec(text)) !== null) {
    let token = m[0];
    const start = m.index;
    const tail = token.match(TRAILING);
    if (tail) token = token.slice(0, -tail[0].length);
    if (!token) continue;
    if (start > last) parts.push(text.slice(last, start));
    parts.push({ token });
    // Anything trimmed off (the punctuation) is picked up by the next plain slice.
    last = start + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));

  if (parts.length === 0) return <Text style={style} {...rest}>{text}</Text>;

  return (
    <Text style={style} {...rest}>
      {parts.map((p, i) => (typeof p === 'string' ? p : (
        <Text key={i} style={linkStyle} onPress={() => open(p.token)}>{p.token}</Text>
      )))}
    </Text>
  );
}
