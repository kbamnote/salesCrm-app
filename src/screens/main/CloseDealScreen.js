import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, Image, Platform, KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dealsApi } from '../../api';
import { uploadToCloudinary } from '../../services/cloudinary';
import { Theme } from '../../theme/Theme';

const CLOUD_NAME = 'dpreeciaf';
const UPLOAD_PRESET = 'salescrm_attendance';

const STEPS = ['Basic', 'Business', 'Cart', 'Payment'];
const SOCIALS = ['Google', 'Instagram', 'Facebook', 'WhatsApp', 'YouTube', 'LinkedIn', 'Website'];

// Page 3 cart items (quantities only — no prices).
const CART = [
  { key: 'nfc_card', name: 'NFC Business Card' },
  { key: 'ai_review_card', name: 'AI NFC Review Card' },
  { key: 'standee', name: 'NFC Business Standee', qr: true, socials: true },
  { key: 'keychain', name: 'NFC Keychains' },
  { key: 'sticker', name: 'NFC Sticker', socials: true },
];

const PAY_MODES = [
  { key: 'razorpay', label: 'Razorpay', icon: 'flash-outline', soon: true },
  { key: 'cash', label: 'Cash', icon: 'cash-outline' },
  { key: 'pdc', label: 'PDC', icon: 'document-outline' },
];

export default function CloseDealScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // Idempotency: create the deal + record the payment at most once, even if the
  // rep re-taps "Close Deal" after a transient error. dealKey lets the server
  // dedupe a retry that actually succeeded server-side (e.g. a timed-out request).
  const dealKeyRef = useRef(`${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const closedRef = useRef(null); // { meetingId, client, amount } once the deal is created
  const paidRef = useRef(0);      // amount already recorded via addPayment

  // Page 1 — basic
  const [basic, setBasic] = useState({
    companyName: '', ownerName: '', contactNo: '', whatsapp: '',
    gst: '', address: '', dob: '', email: '',
  });
  const [showDob, setShowDob] = useState(false);
  const setB = (k, v) => setBasic((p) => ({ ...p, [k]: v }));

  // Page 2 — business
  const [biz, setBiz] = useState({
    businessName: '', contactPerson: '', googleReviewLink: '', logoUrl: '',
    businessPhone: '', email: '', instagram: '', whatsapp: '', productServiceList: '',
  });
  const [logoUploading, setLogoUploading] = useState(false);
  const setBz = (k, v) => setBiz((p) => ({ ...p, [k]: v }));

  // Page 3 — cart
  const [qty, setQty] = useState({ nfc_card: 0, ai_review_card: 0, standee: 0, keychain: 0, sticker: 0 });
  const [standeeQr, setStandeeQr] = useState('2');
  const [standeeSocials, setStandeeSocials] = useState([]);
  const [stickerSocials, setStickerSocials] = useState([]);
  const [hasGoogleBusiness, setHasGoogleBusiness] = useState(null);
  const [hasInstagram, setHasInstagram] = useState(null);
  const [titaniumCard, setTitaniumCard] = useState(false);

  const inc = (k) => setQty((p) => ({ ...p, [k]: (p[k] || 0) + 1 }));
  const dec = (k) => setQty((p) => ({ ...p, [k]: Math.max(0, (p[k] || 0) - 1) }));
  const toggle = (list, setList, s) =>
    setList(list.includes(s) ? list.filter((x) => x !== s) : [...list, s]);

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

  const validateStep = () => {
    if (step === 1) {
      if (!basic.ownerName.trim() && !basic.companyName.trim()) {
        Alert.alert('Required', 'Enter the company or owner name.'); return false;
      }
      if (!basic.contactNo.trim()) { Alert.alert('Required', 'Contact number is required.'); return false; }
    }
    if (step === 4) {
      if (!(Number(pay.dealAmount) > 0)) { Alert.alert('Deal amount', 'Enter a valid deal amount.'); return false; }
      if (pay.mode === 'pdc' && Number(pay.collectNow) > 0 && !pay.pdcImageUrl) {
        Alert.alert('PDC photo', 'Please upload a photo of the PDC cheque.'); return false;
      }
    }
    return true;
  };

  const next = () => {
    if (!validateStep()) return;
    if (step < 4) setStep(step + 1);
    else submit();
  };
  const back = () => (step > 1 ? setStep(step - 1) : navigation.goBack());

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

        const onboarding = {
          companyName: basic.companyName.trim(), ownerName: basic.ownerName.trim(), contactNo: basic.contactNo.trim(),
          whatsapp: basic.whatsapp.trim(), gst: basic.gst.trim(), address: basic.address.trim(), dob: basic.dob, email: basic.email.trim(),
          businessName: biz.businessName.trim(), contactPerson: biz.contactPerson.trim(), googleReviewLink: biz.googleReviewLink.trim(),
          logoUrl: biz.logoUrl, businessPhone: biz.businessPhone.trim(), businessEmail: biz.email.trim(),
          instagram: biz.instagram.trim(), businessWhatsapp: biz.whatsapp.trim(), productServiceList: biz.productServiceList.trim(),
          hasGoogleBusiness: hasGoogleBusiness === true, hasInstagram: hasInstagram === true, titaniumCard,
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

      // 2) Record the collected payment once (cash/pdc). Razorpay is deferred →
      //    the deal stays payment-pending. Only PDC carries a cheque photo.
      const collect = Number(pay.collectNow) || 0;
      if (!paidRef.current && closed.meetingId && (pay.mode === 'cash' || pay.mode === 'pdc') && collect > 0) {
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
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Step progress */}
      <View style={styles.progress}>
        {STEPS.map((label, i) => {
          const n = i + 1;
          const done = n < step;
          const active = n === step;
          return (
            <React.Fragment key={label}>
              <View style={styles.progItem}>
                <View style={[styles.progDot, active && styles.progDotActive, done && styles.progDotDone]}>
                  {done ? <Ionicons name="checkmark" size={13} color="#fff" /> : <Text style={[styles.progNum, active && { color: '#fff' }]}>{n}</Text>}
                </View>
                <Text style={[styles.progLabel, active && { color: Theme.colors.primary, fontWeight: '800' }]}>{label}</Text>
              </View>
              {i < STEPS.length - 1 && <View style={[styles.progBar, done && { backgroundColor: Theme.colors.primary }]} />}
            </React.Fragment>
          );
        })}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        {step === 1 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Basic Information</Text>
            <Field label="Company Name" value={basic.companyName} onChange={(v) => setB('companyName', v)} />
            <Field label="Owner Name" value={basic.ownerName} onChange={(v) => setB('ownerName', v)} />
            <Field label="Contact No. *" value={basic.contactNo} onChange={(v) => setB('contactNo', v)} keyboardType="phone-pad" />
            <Field label="WhatsApp No." value={basic.whatsapp} onChange={(v) => setB('whatsapp', v)} keyboardType="phone-pad" />
            <Field label="GST No." value={basic.gst} onChange={(v) => setB('gst', v)} autoCap="characters" />
            <Field label="Address" value={basic.address} onChange={(v) => setB('address', v)} multiline />
            <Text style={styles.label}>Date of Birth</Text>
            <TouchableOpacity style={styles.input} onPress={() => setShowDob(true)}>
              <Text style={basic.dob ? styles.inputText : styles.placeholder}>{basic.dob || 'Select date'}</Text>
            </TouchableOpacity>
            {showDob && (
              <DateTimePicker
                value={basic.dob ? new Date(basic.dob) : new Date(2000, 0, 1)}
                mode="date"
                maximumDate={new Date()}
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(e, d) => { setShowDob(false); if (e?.type !== 'dismissed' && d) setB('dob', d.toISOString().slice(0, 10)); }}
              />
            )}
            <Field label="Email ID" value={basic.email} onChange={(v) => setB('email', v)} keyboardType="email-address" autoCap="none" />
          </View>
        )}

        {step === 2 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Business Details</Text>
            <Field label="Business Name" value={biz.businessName} onChange={(v) => setBz('businessName', v)} />
            <Field label="Contact Person's Name" value={biz.contactPerson} onChange={(v) => setBz('contactPerson', v)} />
            <Field label="Google Map / Review Link" value={biz.googleReviewLink} onChange={(v) => setBz('googleReviewLink', v)} autoCap="none" />

            <Text style={styles.label}>Business Logo (high-resolution)</Text>
            <TouchableOpacity style={styles.uploadBox} onPress={() => pickImage((url) => setBz('logoUrl', url), setLogoUploading)} disabled={logoUploading}>
              {logoUploading ? (
                <ActivityIndicator color={Theme.colors.primary} />
              ) : biz.logoUrl ? (
                <Image source={{ uri: biz.logoUrl }} style={styles.uploadPreview} resizeMode="contain" />
              ) : (
                <><Ionicons name="cloud-upload-outline" size={26} color={Theme.colors.primary} /><Text style={styles.uploadText}>Upload logo</Text></>
              )}
            </TouchableOpacity>
            {biz.logoUrl && !logoUploading ? (
              <TouchableOpacity onPress={() => pickImage((url) => setBz('logoUrl', url), setLogoUploading)}><Text style={styles.changeLink}>Change logo</Text></TouchableOpacity>
            ) : null}

            <Field label="Business Phone Number" value={biz.businessPhone} onChange={(v) => setBz('businessPhone', v)} keyboardType="phone-pad" />
            <Field label="Email ID" value={biz.email} onChange={(v) => setBz('email', v)} keyboardType="email-address" autoCap="none" />
            <Field label="Instagram Profile Link" value={biz.instagram} onChange={(v) => setBz('instagram', v)} autoCap="none" />
            <Field label="WhatsApp Number" value={biz.whatsapp} onChange={(v) => setBz('whatsapp', v)} keyboardType="phone-pad" />
            <Field label="Product / Service List" value={biz.productServiceList} onChange={(v) => setBz('productServiceList', v)} multiline />
          </View>
        )}

        {step === 3 && (
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
                        <TouchableOpacity key={n} style={[styles.segBtn, standeeQr === n && styles.segBtnActive]} onPress={() => setStandeeQr(n)}>
                          <Text style={[styles.segText, standeeQr === n && { color: '#fff' }]}>{n} QR</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}
                {c.socials && qty[c.key] > 0 && (
                  <View style={styles.optionBlock}>
                    <Text style={styles.optionLabel}>Social media</Text>
                    <View style={styles.chipWrap}>
                      {SOCIALS.map((s) => {
                        const list = c.key === 'standee' ? standeeSocials : stickerSocials;
                        const setList = c.key === 'standee' ? setStandeeSocials : setStickerSocials;
                        const on = list.includes(s);
                        return (
                          <TouchableOpacity key={s} style={[styles.chip, on && styles.chipOn]} onPress={() => toggle(list, setList, s)}>
                            <Text style={[styles.chipText, on && { color: '#fff' }]}>{s}</Text>
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

            <TouchableOpacity style={styles.checkRow} onPress={() => setTitaniumCard((v) => !v)}>
              <View style={[styles.checkbox, titaniumCard && styles.checkboxOn]}>{titaniumCard && <Ionicons name="checkmark" size={16} color="#fff" />}</View>
              <Text style={styles.flagLabel}>Titanium Card</Text>
            </TouchableOpacity>
          </View>
        )}

        {step === 4 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Payment Collection</Text>

            <Field label="Total Deal Amount (₹) *" value={pay.dealAmount} onChange={onDealAmount} keyboardType="numeric" />

            <Text style={styles.label}>Payment Mode</Text>
            <View style={styles.modeRow}>
              {PAY_MODES.map((m) => {
                const active = pay.mode === m.key;
                return (
                  <TouchableOpacity key={m.key} style={[styles.modeChip, active && styles.modeChipActive]} onPress={() => setPay((p) => ({ ...p, mode: m.key, pdcImageUrl: m.key === 'pdc' ? p.pdcImageUrl : '' }))}>
                    <Ionicons name={m.icon} size={16} color={active ? '#fff' : Theme.colors.primary} />
                    <Text style={[styles.modeText, active && { color: '#fff' }]}>{m.label}</Text>
                    {m.soon && <Text style={[styles.soonTag, active && { color: '#fff', borderColor: 'rgba(255,255,255,0.6)' }]}>SOON</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>

            {pay.mode === 'razorpay' ? (
              <View style={styles.soonBox}>
                <Ionicons name="flash-outline" size={16} color={Theme.colors.textSecondary} />
                <Text style={styles.soonBoxText}>Razorpay online payment will be integrated soon. The deal will be saved with payment marked pending.</Text>
              </View>
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
        )}
      </ScrollView>

      {/* Footer nav */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <TouchableOpacity style={styles.backBtn} onPress={back} disabled={submitting}>
          <Ionicons name="chevron-back" size={18} color={Theme.colors.primary} />
          <Text style={styles.backText}>{step === 1 ? 'Cancel' : 'Back'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.nextBtn, submitting && { opacity: 0.7 }]} onPress={next} disabled={submitting}>
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={styles.nextText}>{step === 4 ? 'Close Deal' : 'Next'}</Text>
              <Ionicons name={step === 4 ? 'checkmark-circle' : 'chevron-forward'} size={18} color="#fff" />
            </>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function Field({ label, value, onChange, keyboardType, autoCap, multiline }) {
  return (
    <View style={{ marginBottom: 4 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.textarea]}
        value={value}
        onChangeText={onChange}
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
  chipText: { fontFamily: Theme.typography.fontFamily, fontSize: 12, fontWeight: '600', color: Theme.colors.text },

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
  soonTag: { fontFamily: Theme.typography.fontFamily, fontSize: 8, fontWeight: '800', color: Theme.colors.textSecondary, borderWidth: 1, borderColor: Theme.colors.border, borderRadius: 4, paddingHorizontal: 3, paddingVertical: 1, marginLeft: 2 },
  soonBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F1F5F9', borderRadius: 10, padding: 12, marginTop: 10 },
  soonBoxText: { flex: 1, fontFamily: Theme.typography.fontFamily, fontSize: 12, color: Theme.colors.textSecondary, lineHeight: 17 },

  // Footer
  footer: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: Theme.colors.border },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 16, paddingVertical: 14 },
  backText: { fontFamily: Theme.typography.fontFamily, fontSize: 14, fontWeight: '700', color: Theme.colors.primary },
  nextBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Theme.colors.primary, borderRadius: 12, paddingVertical: 15 },
  nextText: { fontFamily: Theme.typography.fontFamily, fontSize: 15, fontWeight: '800', color: '#fff' },
});
