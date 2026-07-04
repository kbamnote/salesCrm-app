import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView,
  TextInput, ActivityIndicator, Alert, Linking, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { whatsappApi } from '../api';
import { Theme } from '../theme/Theme';

const WHATSAPP_GREEN = '#25D366';

// Template catalog. {{1}} is ALWAYS the recipient name (filled automatically).
// `extras` are the additional {{n}} params the sender must type in, in order.
// `preview` renders the message body with {{1}} = recipient.name and the
// extras substituted, for a live preview.
const TEMPLATES = {
  welcome: {
    label: 'Welcome',
    extras: [],
    preview: (name) =>
      `Hi ${name}, welcome to Tapify! We're glad to have you on board. Let us know how we can help.`,
  },
  follow_up: {
    label: 'Follow up',
    extras: [],
    preview: (name) =>
      `Hi ${name}, just following up on our earlier conversation. Do let us know if you have any questions.`,
  },
  appointment_reminder: {
    label: 'Appointment reminder',
    extras: ['Date', 'Time'],
    preview: (name, [date, time]) =>
      `Hi ${name}, this is a reminder for your appointment on ${date || '{{Date}}'} at ${time || '{{Time}}'}. See you then!`,
  },
  deal_confirmation: {
    label: 'Deal confirmation',
    extras: [],
    preview: (name) =>
      `Hi ${name}, thank you for confirming your deal with us. We'll be in touch with the next steps shortly.`,
  },
  membership_confirmation: {
    label: 'Membership confirmation',
    extras: ['Card no', 'Validity'],
    preview: (name, [card, validity]) =>
      `Hi ${name}, your membership is confirmed. Card no: ${card || '{{Card no}}'}, valid till ${validity || '{{Validity}}'}. Welcome aboard!`,
  },
};

export default function WhatsAppComposeModal({ visible, onClose, recipient }) {
  const rName = recipient?.name || 'there';
  const rPhone = recipient?.phone || '';

  const [mode, setMode] = useState('template'); // 'template' | 'custom'
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templateStatus, setTemplateStatus] = useState({}); // { name: 'APPROVED' | 'PENDING' }
  const [selected, setSelected] = useState(null); // template name
  const [extraValues, setExtraValues] = useState({}); // { name: [v0, v1, ...] }
  const [customText, setCustomText] = useState('');
  const [sending, setSending] = useState(false);

  // Fetch template approval status whenever the modal opens.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoadingTemplates(true);
    whatsappApi.templates()
      .then((rows) => {
        if (cancelled) return;
        const map = {};
        (Array.isArray(rows) ? rows : []).forEach((t) => {
          if (t && t.name) map[t.name] = t.status;
        });
        setTemplateStatus(map);
      })
      .catch(() => {
        if (!cancelled) setTemplateStatus({});
      })
      .finally(() => {
        if (!cancelled) setLoadingTemplates(false);
      });
    return () => { cancelled = true; };
  }, [visible]);

  // Reset composer state each time the modal opens.
  useEffect(() => {
    if (visible) {
      setMode('template');
      setSelected(null);
      setExtraValues({});
      setCustomText('');
    }
  }, [visible]);

  const isApproved = (name) => templateStatus[name] === 'APPROVED';

  const selectedExtras = selected ? TEMPLATES[selected].extras : [];
  const selectedExtraValues = selected ? (extraValues[selected] || []) : [];

  const setExtra = (idx, value) => {
    setExtraValues((prev) => {
      const arr = (prev[selected] || []).slice();
      arr[idx] = value;
      return { ...prev, [selected]: arr };
    });
  };

  const previewBody = useMemo(() => {
    if (mode === 'custom') return customText;
    if (!selected) return '';
    return TEMPLATES[selected].preview(rName, selectedExtraValues);
  }, [mode, customText, selected, rName, selectedExtraValues]);

  const digits = (rPhone || '').replace(/\D/g, '');

  const canSend =
    !sending &&
    (mode === 'custom'
      ? customText.trim().length > 0
      : !!selected && selectedExtras.every((_, i) => (selectedExtraValues[i] || '').trim().length > 0));

  const handleSend = async () => {
    if (!canSend) return;
    if (!rPhone) {
      Alert.alert('No phone number', 'This contact has no phone number to message.');
      return;
    }
    setSending(true);
    try {
      const payload = {
        phone: recipient.phone,
        name: recipient.name,
        entity: recipient.entity,
        entityId: recipient.entityId,
      };
      if (mode === 'template') {
        payload.templateName = selected;
        payload.params = [rName, ...selectedExtras.map((_, i) => selectedExtraValues[i] || '')];
      } else {
        payload.body = customText.trim();
      }
      await whatsappApi.send(payload);
      Alert.alert('Sent', 'Your WhatsApp message has been sent.');
      onClose && onClose();
    } catch (e) {
      const msg = e?.response?.data?.message || e?.message || 'Could not send the message.';
      Alert.alert('Send failed', msg);
    } finally {
      setSending(false);
    }
  };

  const openInWhatsApp = () => {
    if (!digits) return;
    Linking.openURL(`https://wa.me/${digits}`);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.iconCircle}>
                <Ionicons name="logo-whatsapp" size={22} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>Send WhatsApp</Text>
                <Text style={styles.subtitle} numberOfLines={1}>
                  {rName}{rPhone ? ` · ${rPhone}` : ''}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={24} color={Theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Segmented control */}
          <View style={styles.segment}>
            <TouchableOpacity
              style={[styles.segmentBtn, mode === 'template' && styles.segmentBtnActive]}
              onPress={() => setMode('template')}
            >
              <Text style={[styles.segmentText, mode === 'template' && styles.segmentTextActive]}>Template</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segmentBtn, mode === 'custom' && styles.segmentBtnActive]}
              onPress={() => setMode('custom')}
            >
              <Text style={[styles.segmentText, mode === 'custom' && styles.segmentTextActive]}>Custom message</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
            {mode === 'template' ? (
              <>
                {loadingTemplates ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator color={Theme.colors.primary} />
                    <Text style={styles.loadingText}>Loading templates…</Text>
                  </View>
                ) : null}

                {Object.keys(TEMPLATES).map((name) => {
                  const meta = TEMPLATES[name];
                  const approved = isApproved(name);
                  const pending = templateStatus[name] === 'PENDING';
                  const active = selected === name;
                  return (
                    <TouchableOpacity
                      key={name}
                      style={[
                        styles.templateItem,
                        active && styles.templateItemActive,
                        !approved && styles.templateItemDisabled,
                      ]}
                      disabled={!approved}
                      onPress={() => setSelected(name)}
                    >
                      <Ionicons
                        name={active ? 'radio-button-on' : 'radio-button-off'}
                        size={20}
                        color={active ? WHATSAPP_GREEN : Theme.colors.border}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.templateLabel, !approved && styles.templateLabelDisabled]}>
                          {meta.label}
                        </Text>
                        {pending ? (
                          <Text style={styles.pendingNote}>Pending approval</Text>
                        ) : !approved ? (
                          <Text style={styles.pendingNote}>Not available</Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}

                {/* Extra params for the selected template */}
                {selected && selectedExtras.length > 0 ? (
                  <View style={styles.paramsBox}>
                    {selectedExtras.map((paramLabel, idx) => (
                      <View key={paramLabel} style={styles.paramField}>
                        <Text style={styles.paramLabel}>{paramLabel}</Text>
                        <TextInput
                          style={styles.input}
                          placeholder={paramLabel}
                          placeholderTextColor={Theme.colors.textSecondary}
                          value={selectedExtraValues[idx] || ''}
                          onChangeText={(v) => setExtra(idx, v)}
                        />
                      </View>
                    ))}
                  </View>
                ) : null}

                {/* Live preview */}
                {selected ? (
                  <View style={styles.previewBox}>
                    <Text style={styles.previewLabel}>Preview</Text>
                    <Text style={styles.previewText}>{previewBody}</Text>
                  </View>
                ) : null}
              </>
            ) : (
              <>
                <TextInput
                  style={[styles.input, styles.multiline]}
                  placeholder="Type your message…"
                  placeholderTextColor={Theme.colors.textSecondary}
                  value={customText}
                  onChangeText={setCustomText}
                  multiline
                  textAlignVertical="top"
                />
                <Text style={styles.helperNote}>
                  Free text only delivers if the customer messaged you in the last 24 hours.
                </Text>
              </>
            )}
          </ScrollView>

          {/* Send */}
          <TouchableOpacity
            style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!canSend}
            activeOpacity={0.85}
          >
            {sending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="send" size={18} color="#fff" />
                <Text style={styles.sendText}>Send WhatsApp</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Fallback: open in WhatsApp app */}
          {digits ? (
            <TouchableOpacity style={styles.fallbackBtn} onPress={openInWhatsApp} activeOpacity={0.7}>
              <Ionicons name="open-outline" size={16} color={Theme.colors.textSecondary} />
              <Text style={styles.fallbackText}>Open in WhatsApp app</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  card: {
    backgroundColor: '#fff',
    borderTopLeftRadius: Theme.borderRadius.xl,
    borderTopRightRadius: Theme.borderRadius.xl,
    padding: Theme.spacing.l,
    maxHeight: '88%',
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Theme.spacing.m },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  iconCircle: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: WHATSAPP_GREEN,
    alignItems: 'center', justifyContent: 'center',
  },
  title: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.l,
    fontWeight: Theme.typography.weights.bold,
    color: Theme.colors.text,
  },
  subtitle: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.xs,
    color: Theme.colors.textSecondary,
    marginTop: 1,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: Theme.colors.background,
    borderRadius: Theme.borderRadius.m,
    padding: 4,
    marginBottom: Theme.spacing.m,
  },
  segmentBtn: { flex: 1, paddingVertical: 9, borderRadius: Theme.borderRadius.s, alignItems: 'center' },
  segmentBtnActive: { backgroundColor: '#fff', elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2 },
  segmentText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    color: Theme.colors.textSecondary,
    fontWeight: Theme.typography.weights.medium,
  },
  segmentTextActive: { color: Theme.colors.text, fontWeight: Theme.typography.weights.bold },
  scroll: { marginBottom: Theme.spacing.m },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: Theme.spacing.s },
  loadingText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    color: Theme.colors.textSecondary,
  },
  templateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: Theme.borderRadius.m,
    borderWidth: 1.5,
    borderColor: Theme.colors.border,
    marginBottom: Theme.spacing.s,
  },
  templateItemActive: { borderColor: WHATSAPP_GREEN, backgroundColor: '#F0FDF4' },
  templateItemDisabled: { opacity: 0.55, backgroundColor: Theme.colors.background },
  templateLabel: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    color: Theme.colors.text,
    fontWeight: Theme.typography.weights.medium,
  },
  templateLabelDisabled: { color: Theme.colors.textSecondary },
  pendingNote: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.xs,
    color: Theme.colors.warning,
    marginTop: 2,
  },
  paramsBox: { marginTop: Theme.spacing.s },
  paramField: { marginBottom: Theme.spacing.s },
  paramLabel: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 11,
    color: Theme.colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  input: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    color: Theme.colors.text,
    borderWidth: 1.5,
    borderColor: Theme.colors.border,
    borderRadius: Theme.borderRadius.m,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  multiline: { minHeight: 120 },
  helperNote: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.xs,
    color: Theme.colors.textSecondary,
    fontStyle: 'italic',
    marginTop: Theme.spacing.s,
    lineHeight: 18,
  },
  previewBox: {
    marginTop: Theme.spacing.m,
    backgroundColor: '#F0FDF4',
    borderRadius: Theme.borderRadius.m,
    padding: Theme.spacing.m,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  previewLabel: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 11,
    color: '#065F46',
    textTransform: 'uppercase',
    fontWeight: Theme.typography.weights.bold,
    marginBottom: 6,
  },
  previewText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    color: Theme.colors.text,
    lineHeight: 21,
  },
  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: WHATSAPP_GREEN,
    borderRadius: Theme.borderRadius.m,
    minHeight: 48,
    paddingVertical: 12,
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    fontWeight: Theme.typography.weights.bold,
    color: '#fff',
  },
  fallbackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    marginTop: 4,
  },
  fallbackText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    color: Theme.colors.textSecondary,
  },
});
