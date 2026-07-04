import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { whatsappApi } from '../api';
import { Theme } from '../theme/Theme';

const WHATSAPP_GREEN = '#25D366';
const SAMPLE_NAME = 'Rahul';

// Only NAME-ONLY templates are offered for bulk (keeps campaigns simple —
// {{1}} = each recipient's own name, no extra params to fill in). Any other
// approved template is shown greyed-out with a note that it needs extra params.
const NAME_ONLY = {
  welcome: {
    label: 'Welcome',
    preview: (name) =>
      `Hi ${name}, welcome to Tapify! We're glad to have you on board. Let us know how we can help.`,
  },
  follow_up: {
    label: 'Follow up',
    preview: (name) =>
      `Hi ${name}, just following up on our earlier conversation. Do let us know if you have any questions.`,
  },
};

export default function BulkWhatsAppModal({ visible, onClose, recipients = [] }) {
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templates, setTemplates] = useState([]); // [{ name, status, ... }]
  const [selected, setSelected] = useState(null); // template name
  const [sending, setSending] = useState(false);

  const count = recipients.length;

  // Fetch template approval status whenever the modal opens.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoadingTemplates(true);
    setSelected(null);
    whatsappApi.templates()
      .then((rows) => {
        if (cancelled) return;
        setTemplates(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setTemplates([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingTemplates(false);
      });
    return () => { cancelled = true; };
  }, [visible]);

  // Map template name -> APPROVED status for quick lookup.
  const statusByName = useMemo(() => {
    const map = {};
    templates.forEach((t) => { if (t && t.name) map[t.name] = t.status; });
    return map;
  }, [templates]);

  const isApproved = (name) => statusByName[name] === 'APPROVED';

  // The name-only, approved templates the user can actually pick for bulk.
  const bulkTemplates = useMemo(
    () => Object.keys(NAME_ONLY).filter((name) => isApproved(name)),
    [statusByName]
  );

  // Any other approved templates on the WABA that we deliberately don't offer
  // for bulk (they need extra params). Shown greyed-out with a warning.
  const otherApproved = useMemo(
    () => templates
      .filter((t) => t && t.status === 'APPROVED' && !NAME_ONLY[t.name])
      .map((t) => t.name),
    [templates]
  );

  const previewBody = useMemo(() => {
    if (!selected || !NAME_ONLY[selected]) return '';
    return NAME_ONLY[selected].preview(SAMPLE_NAME);
  }, [selected]);

  const canSend = !sending && count > 0 && !!selected;

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      const payload = {
        recipients: recipients.map((r) => ({
          phone: r.phone,
          name: r.name,
          entity: 'lead',
          entityId: r._id,
        })),
        templateName: selected,
      };
      const res = await whatsappApi.sendBulk(payload);
      const queued = res?.queued ?? 0;
      const sent = res?.sent ?? 0;
      const failed = res?.failed ?? 0;
      Alert.alert(
        'Campaign sent',
        `Sent: ${sent}\nQueued: ${queued}\nFailed: ${failed}`,
      );
      onClose && onClose();
    } catch (e) {
      const msg = e?.response?.data?.error || e?.response?.data?.message || e?.message || 'Could not send the campaign.';
      Alert.alert('Send failed', msg);
    } finally {
      setSending(false);
    }
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
                <Text style={styles.title}>Bulk WhatsApp</Text>
                <Text style={styles.subtitle} numberOfLines={1}>
                  {count} recipient{count === 1 ? '' : 's'}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={24} color={Theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
            <Text style={styles.sectionLabel}>Choose a template</Text>

            {loadingTemplates ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={Theme.colors.primary} />
                <Text style={styles.loadingText}>Loading templates…</Text>
              </View>
            ) : null}

            {/* Name-only templates that are approved — selectable. */}
            {!loadingTemplates && bulkTemplates.length === 0 ? (
              <Text style={styles.emptyNote}>
                No approved name-only templates are available for bulk sending yet.
              </Text>
            ) : null}

            {bulkTemplates.map((name) => {
              const meta = NAME_ONLY[name];
              const active = selected === name;
              return (
                <TouchableOpacity
                  key={name}
                  style={[styles.templateItem, active && styles.templateItemActive]}
                  onPress={() => setSelected(name)}
                >
                  <Ionicons
                    name={active ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={active ? WHATSAPP_GREEN : Theme.colors.border}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.templateLabel}>{meta.label}</Text>
                    <Text style={styles.templateHint}>Personalised with each recipient's name</Text>
                  </View>
                </TouchableOpacity>
              );
            })}

            {/* Other approved templates — greyed out, need extra params. */}
            {otherApproved.map((name) => (
              <View key={name} style={[styles.templateItem, styles.templateItemDisabled]}>
                <Ionicons name="radio-button-off" size={20} color={Theme.colors.border} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.templateLabelDisabled}>{name}</Text>
                  <Text style={styles.warnNote}>Needs extra details — not available for bulk</Text>
                </View>
              </View>
            ))}

            {/* Live preview using a sample name. */}
            {selected ? (
              <View style={styles.previewBox}>
                <Text style={styles.previewLabel}>Preview (sample name)</Text>
                <Text style={styles.previewText}>{previewBody}</Text>
              </View>
            ) : null}
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
                <Text style={styles.sendText}>Send to {count}</Text>
              </>
            )}
          </TouchableOpacity>
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
  scroll: { marginBottom: Theme.spacing.m },
  sectionLabel: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: 11,
    color: Theme.colors.textSecondary,
    textTransform: 'uppercase',
    fontWeight: Theme.typography.weights.bold,
    marginBottom: Theme.spacing.s,
  },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: Theme.spacing.s },
  loadingText: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    color: Theme.colors.textSecondary,
  },
  emptyNote: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.s,
    color: Theme.colors.textSecondary,
    marginBottom: Theme.spacing.s,
    lineHeight: 20,
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
  templateLabelDisabled: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.m,
    color: Theme.colors.textSecondary,
    fontWeight: Theme.typography.weights.medium,
  },
  templateHint: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.xs,
    color: Theme.colors.textSecondary,
    marginTop: 2,
  },
  warnNote: {
    fontFamily: Theme.typography.fontFamily,
    fontSize: Theme.typography.sizes.xs,
    color: Theme.colors.warning,
    marginTop: 2,
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
});
