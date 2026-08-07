import React from 'react';
import { Text, Linking, Alert } from 'react-native';

// Matched in order: http(s):// URLs, bare "www." URLs, e-mail addresses, then
// Indian phone numbers. URLs come first so digits inside a link aren't mistaken
// for a phone number.
//
// The phone part deliberately only matches Indian mobiles — 10 digits starting
// 6-9, optionally +91-prefixed and optionally split 5+5 by a space or hyphen.
// A loose "any long run of digits" pattern would turn timestamps and order ids
// into fake call links.
const PATTERN =
  /((?:https?:\/\/|www\.)[^\s<>()"']+|[\w.+-]+@[\w-]+\.[\w.-]+|(?:\+?91[-\s]?)?[6-9]\d{4}[-\s]?\d{5})/gi;

// Punctuation that usually ENDS a sentence rather than belonging to the link,
// e.g. "see https://tapify.co.in." — the trailing dot isn't part of the URL.
const TRAILING = /[.,!?;:)\]}>]+$/;

const isUrl = (t) => /^(https?:\/\/|www\.)/i.test(t);
const isEmail = (t) => t.includes('@');

const hrefFor = (token) => {
  if (/^https?:\/\//i.test(token)) return token;
  if (isEmail(token)) return `mailto:${token}`;
  if (isUrl(token)) return `https://${token}`;              // bare www.…
  return `tel:${token.replace(/[^\d+]/g, '')}`;             // phone → dialler
};

const open = (token) => {
  const url = hrefFor(token);
  Linking.openURL(url).catch(() =>
    Alert.alert(url.startsWith('tel:') ? 'Could not start the call' : 'Could not open link', token));
};

/**
 * Renders text with URLs, e-mails and phone numbers turned into tappable links.
 * Phone numbers open the dialler. Drop-in replacement for <Text> — same style
 * prop, plus `linkStyle`.
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

    // A phone match must not sit inside a longer run of digits (e.g. an order
    // id), otherwise we'd link the first 10 digits of it. Checked here rather
    // than with a lookbehind, which isn't safe across JS engines.
    if (!isUrl(token) && !isEmail(token)) {
      const before = text[start - 1];
      const after = text[start + token.length];
      if (/\d/.test(before || '') || /\d/.test(after || '')) {
        last = Math.max(last, start);               // leave it as plain text
        continue;
      }
    }

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
