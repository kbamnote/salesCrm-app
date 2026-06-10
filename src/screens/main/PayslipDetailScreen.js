import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { payrollApi } from '../../api';
import { Theme } from '../../theme/Theme';

const INR = (n) => '₹' + (Number(n) || 0).toLocaleString('en-IN');

export default function PayslipDetailScreen({ route }) {
  const { payslipId, payslip: initial } = route.params || {};
  const [slip, setSlip] = useState(initial || null);
  const [loading, setLoading] = useState(!initial);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!initial && payslipId) {
      payrollApi.getPayslip(payslipId)
        .then((r) => setSlip(r.data))
        .catch(() => Alert.alert('Error', 'Could not load this payslip.'))
        .finally(() => setLoading(false));
    }
  }, [payslipId]);

  const download = async () => {
    if (!slip?._id) return;
    setDownloading(true);
    try {
      const res = await payrollApi.payslipPdf(slip._id);
      const { filename, base64 } = res.data;
      const fileUri = `${FileSystem.cacheDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: 'application/pdf', dialogTitle: 'Payslip', UTI: 'com.adobe.pdf' });
      } else {
        Alert.alert('Saved', `Payslip saved as ${filename}.`);
      }
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Could not generate the PDF.');
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={Theme.colors.primary} /></View>;
  }
  if (!slip) {
    return <View style={styles.center}><Text style={styles.muted}>Payslip not found.</Text></View>;
  }

  const Row = ({ label, value, strong }) => (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, strong && styles.strong]}>{label}</Text>
      <Text style={[styles.rowValue, strong && styles.strong]}>{value}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        {/* Title */}
        <View style={styles.titleBar}>
          <Text style={styles.titleText}>Salary Slip — {slip.monthLabel}</Text>
        </View>

        {/* Employee info */}
        <View style={styles.card}>
          <Row label="Employee Name" value={slip.employeeName} />
          <Row label="Employee Code" value={slip.employeeCode || '—'} />
          <Row label="Department" value={slip.department || '—'} />
          <Row label="Designation" value={slip.designation || '—'} />
          <Row label="Location" value={slip.location || '—'} />
          <Row label="Monthly CTC" value={slip.monthlyCTC ? INR(slip.monthlyCTC) : '—'} />
          <Row label="Bank A/C No." value={slip.bankAccountNo || '—'} />
          <Row label="PAN No." value={slip.panNo || '—'} />
        </View>

        {/* Earnings */}
        <Text style={styles.section}>Earnings</Text>
        <View style={styles.card}>
          <Row label="Basic Salary" value={INR(slip.basicSalary)} />
          <Row label="House Rent Allowance" value={INR(slip.hra)} />
          <Row label="Other Allowance" value={INR(slip.otherAllowance)} />
          <Row label="Bonus / Incentives" value={INR(slip.bonusIncentives)} />
          <Row label="Working Days" value={String(slip.workingDays ?? 0)} />
          <Row label="Present Days" value={String(slip.presentDays ?? 0)} />
        </View>

        {/* Deductions */}
        <Text style={styles.section}>Deductions</Text>
        <View style={styles.card}>
          <Row label="PF Deduction" value={INR(slip.pfDeduction)} />
          <Row label="Other Deduction" value={INR(slip.otherDeduction)} />
        </View>

        {slip.notes ? (
          <>
            <Text style={styles.section}>Notes</Text>
            <View style={styles.card}><Text style={styles.notes}>{slip.notes}</Text></View>
          </>
        ) : null}

        {/* Totals */}
        <View style={[styles.card, styles.totalsCard]}>
          <Row label="Gross Earnings" value={INR(slip.grossEarnings)} />
          <Row label="Total Deductions" value={INR(slip.totalDeductions)} />
          <View style={styles.netRow}>
            <Text style={styles.netLabel}>Net Payable</Text>
            <Text style={styles.netValue}>{INR(slip.netPayable)}</Text>
          </View>
          <Text style={styles.words}>{slip.amountInWords}</Text>
        </View>
      </ScrollView>

      {/* Download */}
      <TouchableOpacity style={styles.downloadBtn} onPress={download} disabled={downloading} activeOpacity={0.85}>
        {downloading
          ? <ActivityIndicator color="#fff" />
          : <><Ionicons name="download-outline" size={20} color="#fff" /><Text style={styles.downloadText}>Download PDF</Text></>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F2F5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F0F2F5' },
  muted: { fontFamily: Theme.typography.fontFamily, color: Theme.colors.textSecondary },

  titleBar: { backgroundColor: '#003300', borderRadius: 12, padding: 16, marginBottom: 14 },
  titleText: { fontFamily: Theme.typography.fontFamily, color: '#fff', fontSize: 16, fontWeight: '800', textAlign: 'center' },

  section: { fontFamily: Theme.typography.fontFamily, fontSize: 13, fontWeight: '800', color: Theme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 4, marginLeft: 4 },

  card: {
    backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 6, marginBottom: 14,
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  rowLabel: { fontFamily: Theme.typography.fontFamily, fontSize: 13, color: Theme.colors.textSecondary, flex: 1 },
  rowValue: { fontFamily: Theme.typography.fontFamily, fontSize: 13, color: Theme.colors.text, fontWeight: '600', textAlign: 'right' },
  strong: { fontWeight: '800', color: Theme.colors.text },

  notes: { fontFamily: Theme.typography.fontFamily, fontSize: 13, color: Theme.colors.text, paddingVertical: 8, lineHeight: 19 },

  totalsCard: { backgroundColor: '#FAF8F0', borderWidth: 1, borderColor: '#E5DFC8' },
  netRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  netLabel: { fontFamily: Theme.typography.fontFamily, fontSize: 16, fontWeight: '800', color: Theme.colors.text },
  netValue: { fontFamily: Theme.typography.fontFamily, fontSize: 20, fontWeight: '800', color: Theme.colors.primary },
  words: { fontFamily: Theme.typography.fontFamily, fontSize: 12, fontStyle: 'italic', color: Theme.colors.textSecondary, paddingBottom: 6 },

  downloadBtn: {
    position: 'absolute', left: 20, right: 20, bottom: 24, height: 52, borderRadius: 26,
    backgroundColor: Theme.colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    elevation: 4, shadowColor: Theme.colors.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6,
  },
  downloadText: { fontFamily: Theme.typography.fontFamily, color: '#fff', fontSize: 16, fontWeight: '700' },
});
