import React, { useState, useRef, useEffect, useLayoutEffect, useContext, createContext } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, Image, Platform, KeyboardAvoidingView, Keyboard, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import RazorpayCheckout from 'react-native-razorpay';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { dealsApi } from '../../api';
import { uploadToCloudinary } from '../../services/cloudinary';
import { Theme } from '../../theme/Theme';

const CLOUD_NAME = 'dpreeciaf';
const UPLOAD_PRESET = 'salescrm_attendance';

const SOCIALS = ['Google', 'Instagram', 'Facebook', 'WhatsApp', 'YouTube', 'LinkedIn', 'Website'];

// Cart items (quantities only — no prices).
const CART = [
  { key: 'nfc_card', name: 'NFC Business Card' },
  { key: 'ai_review_card', name: 'AI NFC Review Card' },
  { key: 'standee', name: 'NFC Business Standee', qr: true, socials: true },
  { key: 'keychain', name: 'NFC Keychains' },
  { key: 'sticker', name: 'NFC Sticker', socials: true },
];

const PAY_MODES = [
  { key: 'razorpay', label: 'Razorpay', icon: 'flash-outline' },
  { key: 'cash', label: 'Cash', icon: 'cash-outline' },
  { key: 'pdc', label: 'PDC', icon: 'document-outline' },
];

// Lets each Field scroll itself above the keyboard when focused — long forms
// (Basic/Business) would otherwise hide the lower inputs behind the keyboard.
const FieldScrollContext = createContext(null);

export default function CloseDealScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const scrollRef = useRef(null);
  const scrollYRef = useRef(0);
  const { height: winH } = useWindowDimensions();

  // Extra scroll room appears ONLY while the keyboard is open (so there's no
  // permanent empty gap at the bottom). Sized to the actual keyboard height.
  const [kbPad, setKbPad] = useState(0);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvt, (e) => setKbPad(e?.endCoordinates?.height || 0));
    const hideSub = Keyboard.addListener(hideEvt, () => setKbPad(0));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  // Scroll a just-focused field above the keyboard. Uses measure() (absolute
  // window coords) instead of measureLayout — so no "ref to a native component"
  // warning — and only scrolls when the field is actually behind the keyboard.
  const scrollFieldIntoView = (inputEl) => {
    const scroll = scrollRef.current;
    if (!scroll || !inputEl || typeof inputEl.measure !== 'function') return;
    setTimeout(() => {
      inputEl.measure((x, y, w, h, pageX, pageY) => {
        if (pageY == null || !scroll.scrollTo) return;
        const kb = (Keyboard.metrics && Keyboard.metrics()?.height) || 0;
        const visibleBottom = winH - kb - 72; // keep clear of the footer bar
        const fieldBottom = pageY + h;
        if (fieldBottom > visibleBottom - 8) {
          const delta = fieldBottom - visibleBottom + 24;
          scroll.scrollTo({ y: Math.max(0, scrollYRef.current + delta), animated: true });
        }
      });
    }, 120);
  };
  const [submitting, setSubmitting] = useState(false);

  // Idempotency: create the deal + record the payment at most once, even if the
  // rep re-taps "Close Deal" after a transient error. dealKey lets the server
  // dedupe a retry that actually succeeded server-side (e.g. a timed-out request).
  const dealKeyRef = useRef(`${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const closedRef = useRef(null); // { meetingId, client, amount } once the deal is created
  const paidRef = useRef(0);      // amount already recorded via addPayment

  // Customer details. The separate "Business" page used to repeat these five
  // fields; the backend already falls back to these, so they're captured once
  // here and mapped across in submit(). Everything else about the business
  // (logo, socials, product list…) is collected from the customer later through
  // the public onboarding form, so the rep isn't asked for it at signing time.
  const [basic, setBasic] = useState({
    companyName: '', ownerName: '', contactNo: '', whatsapp: '',
    gst: '', address: '', email: '',
  });
  const setB = (k, v) => setBasic((p) => ({ ...p, [k]: v }));

  // Cart
  const [qty, setQty] = useState({ nfc_card: 0, ai_review_card: 0, standee: 0, keychain: 0, sticker: 0 });
  const [standeeQr, setStandeeQr] = useState('2');
  const [standeeSocials, setStandeeSocials] = useState([]);
  const [stickerSocials, setStickerSocials] = useState([]);
  // These two decide whether the order needs a social-media setup stage
  // (see backend services/fulfillment.js) — keep them.
  const [hasGoogleBusiness, setHasGoogleBusiness] = useState(null);
  const [hasInstagram, setHasInstagram] = useState(null);

  const inc = (k) => setQty((p) => ({ ...p, [k]: (p[k] || 0) + 1 }));
  const dec = (k) => setQty((p) => ({ ...p, [k]: Math.max(0, (p[k] || 0) - 1) }));
  const toggle = (list, setList, s) =>
    setList(list.includes(s) ? list.filter((x) => x !== s) : [...list, s]);

  // Standee: the number of selectable social media is capped by the QR count
  // (2 QR → up to 2, 3 QR → up to 3). Lowering the QR count trims any extras.
  const setStandeeQrCount = (n) => {
    setStandeeQr(n);
    setStandeeSocials((prev) => prev.slice(0, Number(n)));
  };
  const toggleStandeeSocial = (s) => {
    const max = Number(standeeQr) || 0;
    if (!standeeSocials.includes(s) && standeeSocials.length >= max) {
      Alert.alert('Limit reached', `With ${max} QR you can pick up to ${max} social media.`);
      return;
    }
    toggle(standeeSocials, setStandeeSocials, s);
  };

  // Sticker: selectable social media is capped by the chosen quantity
  // (2 stickers → up to 2, etc.). Reducing the quantity trims any extras.
  const toggleStickerSocial = (s) => {
    const max = qty.sticker || 0;
    if (!stickerSocials.includes(s) && stickerSocials.length >= max) {
      Alert.alert('Limit reached', `With ${max} sticker${max === 1 ? '' : 's'} you can pick up to ${max} social media.`);
      return;
    }
    toggle(stickerSocials, setStickerSocials, s);
  };
  useEffect(() => {
    setStickerSocials((prev) => (prev.length > (qty.sticker || 0) ? prev.slice(0, qty.sticker || 0) : prev));
  }, [qty.sticker]);

  // Page 4 — payment
  const [pay, setPay] = useState({ mode: 'cash', dealAmount: '', collectNow: '', ref: '', pdcImageUrl: '' });
  const [pdcUploading, setPdcUploading] = useState(false);
  const setPy = (k, v) => setPay((p) => ({ ...p, [k]: v }));
  // Deal amount mirrors into "collect now" until the rep overrides it.
  const onDealAmount = (v) =>
    setPay((p) => ({ ...p, dealAmount: v, collectNow: (p.collectNow === '' || p.collectNow === p.dealAmount) ? v : p.collectNow }));

  const pickImage = async (onDone, setUploading) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('Permission needed', 'Please allow photo access to upload.');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, base64: true });
    if (result.canceled || !result.assets?.[0]?.base64) return;
    setUploading(true);
    try {
      const url = await uploadToCloudinary(result.assets[0].base64, CLOUD_NAME, UPLOAD_PRESET);
      onDone(url);
    } catch (e) {
      Alert.alert('Upload failed', 'Could not upload the image. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  // Single-page form, so everything is validated together on submit.
  const validate = () => {
    if (!basic.ownerName.trim() && !basic.companyName.trim()) {
      Alert.alert('Required', 'Enter the business or owner name.'); return false;
    }
    if (!basic.contactNo.trim()) { Alert.alert('Required', 'Contact number is required.'); return false; }
    if (!(Number(pay.dealAmount) > 0)) { Alert.alert('Deal amount', 'Enter a valid deal amount.'); return false; }
    if (pay.mode === 'pdc' && Number(pay.collectNow) > 0 && !pay.pdcImageUrl) {
      Alert.alert('PDC photo', 'Please upload a photo of the PDC cheque.'); return false;
    }
    if (pay.mode === 'razorpay' && !(Number(pay.collectNow) > 0)) {
      Alert.alert('Amount to collect', 'Enter an amount to collect via Razorpay, or choose another payment mode.'); return false;
    }
    return true;
  };

  const onCloseDeal = () => { if (validate()) submit(); };

  const back = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Root');
  };

  // Always show a header back arrow that reliably exits the flow.
  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity onPress={back} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ paddingRight: 14 }}>
          <Ionicons name="chevron-back" size={26} color={Theme.colors.white} />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  // Opens Razorpay Standard Checkout on the rep's phone for the given amount,
  // then verifies the completed payment against the deal. Never throws — a
  // cancelled/failed checkout just leaves the deal payment-pending.
  const collectViaRazorpay = async (meetingId, amount) => {
    let checkoutResult;
    try {
      const order = await dealsApi.createRazorpayOrder(meetingId, amount);
      const { order_id, amount_paise, currency, key_id } = order.data;
      checkoutResult = await RazorpayCheckout.open({
        key: key_id,
        amount: amount_paise,
        currency,
        order_id,
        name: 'Tapify',
        description: 'Deal payment',
        prefill: {
          name: (basic.ownerName || basic.companyName || '').trim(),
          contact: basic.contactNo.trim(),
          email: basic.email.trim(),
        },
        theme: { color: Theme.colors.primary },
      });
    } catch (e) {
      Alert.alert('Payment not completed', 'The deal has been saved. You can collect this payment another way.');
      return;
    }

    try {
      await dealsApi.verifyRazorpayPayment(meetingId, {
        order_id: checkoutResult.razorpay_order_id,
        payment_id: checkoutResult.razorpay_payment_id,
        signature: checkoutResult.razorpay_signature,
      });
      paidRef.current = amount;
    } catch (e) {
      // The payment may have actually gone through on Razorpay's side even
      // though our confirmation call failed — don't tell the rep it failed.
      Alert.alert(
        'Payment received — confirming',
        'The payment went through but we could not confirm it right now. It will be marked paid once verified.'
      );
    }
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      // 1) Create the deal exactly once. On a retry, reuse the stored result; the
      //    server also dedupes by dealKey so a timed-out-but-succeeded call can't
      //    create a duplicate deal / double the target.
      if (!closedRef.current) {
        const products = CART.filter((c) => qty[c.key] > 0).map((c) => {
          const options = {};
          if (c.key === 'standee') { options.qr = `${standeeQr} QR`; options.socials = standeeSocials; }
          if (c.key === 'sticker') { options.socials = stickerSocials; }
          return { name: c.name, qty: qty[c.key], ...(Object.keys(options).length ? { options } : {}) };
        });

        // The rep now enters each detail once. The business-* keys are still sent
        // (mirrored from the same values) because the Tapify card builder and the
        // customer prefill form read them; the fields we no longer ask for are
        // filled in by the customer through the public onboarding form.
        const onboarding = {
          companyName: basic.companyName.trim(), ownerName: basic.ownerName.trim(), contactNo: basic.contactNo.trim(),
          whatsapp: basic.whatsapp.trim(), gst: basic.gst.trim(), address: basic.address.trim(), email: basic.email.trim(),
          businessName: basic.companyName.trim(), contactPerson: basic.ownerName.trim(),
          businessPhone: basic.contactNo.trim(), businessEmail: basic.email.trim(),
          businessWhatsapp: basic.whatsapp.trim(),
          hasGoogleBusiness: hasGoogleBusiness === true, hasInstagram: hasInstagram === true,
        };

        const clientPayload = {
          name: basic.ownerName.trim() || basic.companyName.trim(),
          company: basic.companyName.trim(),
          phone: basic.contactNo.trim(),
          email: basic.email.trim(),
          address: basic.address.trim(),
          gst: basic.gst.trim(),
        };

        const dealAmount = Number(pay.dealAmount) || 0;
        const res = await dealsApi.close({
          dealKey: dealKeyRef.current,
          client: clientPayload, amount: dealAmount, notes: '', products, onboarding,
        });
        const meeting = res.data;
        closedRef.current = {
          meetingId: meeting?._id,
          amount: dealAmount,
          client: meeting?.client || {
            name: clientPayload.name, email: clientPayload.email, phone: clientPayload.phone, company: clientPayload.company,
          },
        };
      }
      const closed = closedRef.current;

      // 2) Record the collected payment once. Only PDC carries a cheque photo;
      //    Razorpay opens Standard Checkout right here on the rep's phone.
      const collect = Number(pay.collectNow) || 0;
      if (!paidRef.current && closed.meetingId && collect > 0) {
        if (pay.mode === 'razorpay') {
          await collectViaRazorpay(closed.meetingId, collect);
        } else if (pay.mode === 'cash' || pay.mode === 'pdc') {
          try {
            await dealsApi.addPayment(closed.meetingId, {
              mode: pay.mode,
              amount: collect,
              ref: pay.ref.trim(),
              proofUrl: pay.mode === 'pdc' ? (pay.pdcImageUrl || '') : '',
            });
            paidRef.current = collect;
          } catch (e) { /* deal already created — proceed; balance can be taken next step */ }
        }
      }

      navigation.navigate('DealCompleted', {
        meetingId: closed.meetingId, client: closed.client, amount: closed.amount, amountPaid: paidRef.current,
      });
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Failed to close the deal. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FieldScrollContext.Provider value={scrollFieldIntoView}>
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
    >
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 + kbPad }}
        keyboardShouldPersistTaps="handled"
        onScroll={(e) => { scrollYRef.current = e.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={16}
      >
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Customer</Text>
          <Field label="Business / Company Name *" value={basic.companyName} onChange={(v) => setB('companyName', v)} />
          <Field label="Owner / Contact Person *" value={basic.ownerName} onChange={(v) => setB('ownerName', v)} />
          <Field label="Contact No. *" value={basic.contactNo} onChange={(v) => setB('contactNo', v)} keyboardType="phone-pad" />
          <Field label="WhatsApp No." value={basic.whatsapp} onChange={(v) => setB('whatsapp', v)} keyboardType="phone-pad" />
          <Field label="Email ID" value={basic.email} onChange={(v) => setB('email', v)} keyboardType="email-address" autoCap="none" />
          <Field label="Address" value={basic.address} onChange={(v) => setB('address', v)} multiline />
          <Field label="GST No." value={basic.gst} onChange={(v) => setB('gst', v)} autoCap="characters" />
          <Text style={styles.hintNote}>
            Logo, socials and product details are collected from the customer later
            through their onboarding link.
          </Text>
        </View>

        <View style={{ height: 14 }} />

        <View style={styles.card}>
            <Text style={styles.cardTitle}>Products</Text>
            {CART.map((c) => (
              <View key={c.key} style={styles.cartItem}>
                <View style={styles.cartRow}>
                  <Text style={styles.cartName}>{c.name}</Text>
                  <View style={styles.stepper}>
                    <TouchableOpacity style={styles.stepBtn} onPress={() => dec(c.key)}><Ionicons name="remove" size={18} color={Theme.colors.primary} /></TouchableOpacity>
                    <Text style={styles.qtyText}>{qty[c.key]}</Text>
                    <TouchableOpacity style={styles.stepBtn} onPress={() => inc(c.key)}><Ionicons name="add" size={18} color={Theme.colors.primary} /></TouchableOpacity>
                  </View>
                </View>
                {c.qr && qty[c.key] > 0 && (
                  <View style={styles.optionBlock}>
                    <Text style={styles.optionLabel}>QR count</Text>
                    <View style={styles.segRow}>
                      {['2', '3'].map((n) => (
                        <TouchableOpacity key={n} style={[styles.segBtn, standeeQr === n && styles.segBtnActive]} onPress={() => setStandeeQrCount(n)}>
                          <Text style={[styles.segText, standeeQr === n && { color: '#fff' }]}>{n} QR</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}
                {c.socials && qty[c.key] > 0 && (
                  <View style={styles.optionBlock}>
                    <Text style={styles.optionLabel}>
                      Social media (up to {c.key === 'standee' ? Number(standeeQr) : (qty[c.key] || 0)})
                    </Text>
                    <View style={styles.chipWrap}>
                      {SOCIALS.map((s) => {
                        const isStandee = c.key === 'standee';
                        const list = isStandee ? standeeSocials : stickerSocials;
                        const cap = isStandee ? Number(standeeQr) : (qty[c.key] || 0);
                        const on = list.includes(s);
                        const atLimit = !on && list.length >= cap;
                        return (
                          <TouchableOpacity
                            key={s}
                            style={[styles.chip, on && styles.chipOn, atLimit && styles.chipDisabled]}
                            disabled={atLimit}
                            onPress={() => (isStandee ? toggleStandeeSocial(s) : toggleStickerSocial(s))}
                          >
                            <Text style={[styles.chipText, on && { color: '#fff' }, atLimit && styles.chipTextDisabled]}>{s}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}
              </View>
            ))}

            <View style={styles.divider} />

            <View style={styles.flagRow}>
              <Text style={styles.flagLabel}>Do you have a Google Business account?</Text>
              <View style={styles.ynRow}>
                <YN active={hasGoogleBusiness === true} label="Yes" onPress={() => setHasGoogleBusiness(true)} />
                <YN active={hasGoogleBusiness === false} label="No" onPress={() => setHasGoogleBusiness(false)} />
              </View>
            </View>

            <View style={styles.flagRow}>
              <Text style={styles.flagLabel}>Do you have Instagram?</Text>
              <View style={styles.ynRow}>
                <YN active={hasInstagram === true} label="Yes" onPress={() => setHasInstagram(true)} />
                <YN active={hasInstagram === false} label="No" onPress={() => setHasInstagram(false)} />
              </View>
            </View>

        </View>

        <View style={{ height: 14 }} />

        <View style={styles.card}>
            <Text style={styles.cardTitle}>Payment</Text>

            <Field label="Total Deal Amount (₹) *" value={pay.dealAmount} onChange={onDealAmount} keyboardType="numeric" />

            <Text style={styles.label}>Payment Mode</Text>
            <View style={styles.modeRow}>
              {PAY_MODES.map((m) => {
                const active = pay.mode === m.key;
                return (
                  <TouchableOpacity key={m.key} style={[styles.modeChip, active && styles.modeChipActive]} onPress={() => setPay((p) => ({ ...p, mode: m.key, pdcImageUrl: m.key === 'pdc' ? p.pdcImageUrl : '' }))}>
                    <Ionicons name={m.icon} size={16} color={active ? '#fff' : Theme.colors.primary} />
                    <Text style={[styles.modeText, active && { color: '#fff' }]}>{m.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {pay.mode === 'razorpay' ? (
              <>
                <Field label="Amount to Collect via Razorpay (₹)" value={pay.collectNow} onChange={(v) => setPy('collectNow', v)} keyboardType="numeric" />
                <View style={styles.soonBox}>
                  <Ionicons name="flash-outline" size={16} color={Theme.colors.textSecondary} />
                  <Text style={styles.soonBoxText}>Tapping "Close Deal" opens Razorpay Checkout on this phone. The deal is saved either way — if the payment isn't completed, it stays marked pending.</Text>
                </View>
              </>
            ) : (
              <>
                <Field label="Amount Collected Now (₹)" value={pay.collectNow} onChange={(v) => setPy('collectNow', v)} keyboardType="numeric" />
                <Field label={pay.mode === 'pdc' ? 'Cheque No. & Date' : 'Receipt No. (optional)'} value={pay.ref} onChange={(v) => setPy('ref', v)} />
                {pay.mode === 'pdc' && (
                  <>
                    <Text style={styles.label}>PDC Cheque Photo</Text>
                    <TouchableOpacity style={styles.uploadBox} onPress={() => pickImage((url) => setPy('pdcImageUrl', url), setPdcUploading)} disabled={pdcUploading}>
                      {pdcUploading ? (
                        <ActivityIndicator color={Theme.colors.primary} />
                      ) : pay.pdcImageUrl ? (
                        <Image source={{ uri: pay.pdcImageUrl }} style={styles.uploadPreview} resizeMode="cover" />
                      ) : (
                        <><Ionicons name="camera-outline" size={26} color={Theme.colors.primary} /><Text style={styles.uploadText}>Upload PDC photo</Text></>
                      )}
                    </TouchableOpacity>
                    {pay.pdcImageUrl && !pdcUploading ? (
                      <TouchableOpacity onPress={() => pickImage((url) => setPy('pdcImageUrl', url), setPdcUploading)}><Text style={styles.changeLink}>Change photo</Text></TouchableOpacity>
                    ) : null}
                  </>
                )}
              </>
            )}
        </View>
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <TouchableOpacity style={styles.backBtn} onPress={back} disabled={submitting}>
          <Ionicons name="chevron-back" size={18} color={Theme.colors.primary} />
          <Text style={styles.backText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.nextBtn, submitting && { opacity: 0.7 }]} onPress={onCloseDeal} disabled={submitting}>
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={styles.nextText}>Close Deal</Text>
              <Ionicons name="checkmark-circle" size={18} color="#fff" />
            </>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
    </FieldScrollContext.Provider>
  );
}

function Field({ label, value, onChange, keyboardType, autoCap, multiline }) {
  const scrollFieldIntoView = useContext(FieldScrollContext);
  const inputRef = useRef(null);

  return (
    <View style={{ marginBottom: 4 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        ref={inputRef}
        style={[styles.input, multiline && styles.textarea]}
        value={value}
        onChangeText={onChange}
        onFocus={() => scrollFieldIntoView && scrollFieldIntoView(inputRef.current)}
        keyboardType={keyboardType || 'default'}
        autoCapitalize={autoCap || 'sentences'}
        placeholder={label.replace(' *', '')}
        placeholderTextColor={Theme.colors.textSecondary}
        multiline={multiline}
      />
    </View>
  );
}

function YN({ active, label, onPress }) {
  return (
    <TouchableOpacity style={[styles.ynBtn, active && styles.ynBtnActive]} onPress={onPress}>
      <Text style={[styles.ynText, active && { color: '#fff' }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.colors.surface },

  // Progress
  progress: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Theme.colors.border },
  progItem: { alignItems: 'center', width: 60 },
  progDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' },
  progDotActive: { backgroundColor: Theme.colors.primary },
  progDotDone: { backgroundColor: Theme.colors.primary },
  progNum: { fontFamily: Theme.typography.fontFamily, fontSize: 12, fontWeight: '800', color: Theme.colors.textSecondary },
  progLabel: { fontFamily: Theme.typography.fontFamily, fontSize: 10, color: Theme.colors.textSecondary, marginTop: 4 },
  progBar: { flex: 1, height: 2, backgroundColor: '#E5E7EB', marginBottom: 16 },

  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3 },
  cardTitle: { fontFamily: Theme.typography.fontFamily, fontSize: 16, fontWeight: '800', color: Theme.colors.primary, marginBottom: 12 },

  label: { fontFamily: Theme.typography.fontFamily, fontSize: 12, color: Theme.colors.textSecondary, fontWeight: '700', marginBottom: 6, marginTop: 10 },
  input: { backgroundColor: '#F8FAFC', borderRadius: 10, borderWidth: 1, borderColor: Theme.colors.border, paddingHorizontal: 14, paddingVertical: 11, fontFamily: Theme.typography.fontFamily, fontSize: 14, color: Theme.colors.text },
  inputText: { fontFamily: Theme.typography.fontFamily, fontSize: 14, color: Theme.colors.text },
  placeholder: { fontFamily: Theme.typography.fontFamily, fontSize: 14, color: Theme.colors.textSecondary },
  textarea: { height: 80, textAlignVertical: 'top' },
  hintNote: { fontFamily: Theme.typography.fontFamily, fontSize: 11, color: Theme.colors.textSecondary, fontStyle: 'italic', marginTop: 12, lineHeight: 16 },

  // Upload
  uploadBox: { height: 120, borderRadius: 12, borderWidth: 1.5, borderColor: Theme.colors.border, borderStyle: 'dashed', backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  uploadPreview: { width: '100%', height: '100%' },
  uploadText: { fontFamily: Theme.typography.fontFamily, fontSize: 12, fontWeight: '600', color: Theme.colors.textSecondary, marginTop: 6 },
  changeLink: { fontFamily: Theme.typography.fontFamily, fontSize: 12, fontWeight: '700', color: Theme.colors.primary, marginTop: 8, alignSelf: 'center' },

  // Cart
  cartItem: { borderBottomWidth: 1, borderBottomColor: '#F1F5F9', paddingVertical: 12 },
  cartRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cartName: { flex: 1, fontFamily: Theme.typography.fontFamily, fontSize: 14, fontWeight: '700', color: Theme.colors.text, marginRight: 10 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, borderColor: Theme.colors.primary, alignItems: 'center', justifyContent: 'center' },
  qtyText: { fontFamily: Theme.typography.fontFamily, fontSize: 16, fontWeight: '800', color: Theme.colors.text, minWidth: 20, textAlign: 'center' },
  optionBlock: { marginTop: 10 },
  optionLabel: { fontFamily: Theme.typography.fontFamily, fontSize: 11, fontWeight: '700', color: Theme.colors.textSecondary, marginBottom: 6 },
  segRow: { flexDirection: 'row', gap: 8 },
  segBtn: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: Theme.colors.border, backgroundColor: '#fff' },
  segBtnActive: { backgroundColor: Theme.colors.primary, borderColor: Theme.colors.primary },
  segText: { fontFamily: Theme.typography.fontFamily, fontSize: 13, fontWeight: '700', color: Theme.colors.primary },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: Theme.colors.border, backgroundColor: '#fff' },
  chipOn: { backgroundColor: Theme.colors.primary, borderColor: Theme.colors.primary },
  chipDisabled: { backgroundColor: '#F1F5F9', borderColor: Theme.colors.border, opacity: 0.5 },
  chipText: { fontFamily: Theme.typography.fontFamily, fontSize: 12, fontWeight: '600', color: Theme.colors.text },
  chipTextDisabled: { color: Theme.colors.textSecondary },

  divider: { height: 1, backgroundColor: Theme.colors.border, marginVertical: 14 },
  flagRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, gap: 10 },
  flagLabel: { flex: 1, fontFamily: Theme.typography.fontFamily, fontSize: 13, fontWeight: '600', color: Theme.colors.text },
  ynRow: { flexDirection: 'row', gap: 8 },
  ynBtn: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: Theme.colors.border, backgroundColor: '#fff' },
  ynBtnActive: { backgroundColor: Theme.colors.primary, borderColor: Theme.colors.primary },
  ynText: { fontFamily: Theme.typography.fontFamily, fontSize: 13, fontWeight: '700', color: Theme.colors.primary },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: Theme.colors.border, alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: Theme.colors.primary, borderColor: Theme.colors.primary },

  // Payment
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  modeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: Theme.colors.border, backgroundColor: '#fff' },
  modeChipActive: { backgroundColor: Theme.colors.primary, borderColor: Theme.colors.primary },
  modeText: { fontFamily: Theme.typography.fontFamily, fontSize: 13, fontWeight: '700', color: Theme.colors.primary },
  soonBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F1F5F9', borderRadius: 10, padding: 12, marginTop: 10 },
  soonBoxText: { flex: 1, fontFamily: Theme.typography.fontFamily, fontSize: 12, color: Theme.colors.textSecondary, lineHeight: 17 },

  // Footer
  footer: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: Theme.colors.border },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 16, paddingVertical: 14 },
  backText: { fontFamily: Theme.typography.fontFamily, fontSize: 14, fontWeight: '700', color: Theme.colors.primary },
  nextBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Theme.colors.primary, borderRadius: 12, paddingVertical: 15 },
  nextText: { fontFamily: Theme.typography.fontFamily, fontSize: 15, fontWeight: '800', color: '#fff' },
});
