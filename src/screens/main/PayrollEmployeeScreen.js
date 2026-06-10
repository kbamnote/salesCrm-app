import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, Platform, KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { payrollApi } from '../../api';
import { Theme } from '../../theme/Theme';

const INR = (n) => '₹' + (Number(n) || 0).toLocaleString('en-IN');
const toMonthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const monthLabel = (d) => d.toLocaleString('en-US', { month: 'long', year: 'numeric' });

// Salary structure fields (fill once)
const STRUCT_TEXT = [
  { key: 'employeeCode', label: 'Employee Code' },
  { key: 'department', label: 'Department' },
  { key: 'designation', label: 'Designation' },
  { key: 'location', label: 'Location' },
  { key: 'bankAccountNo', label: 'Bank A/C Number', kb: 'numeric' },
  { key: 'aadharNo', label: 'Aadhar No.', kb: 'numeric' },
  { key: 'panNo', label: 'PAN No.' },
];
const STRUCT_NUM = [
  { key: 'monthlyCTC', label: 'Monthly CTC (₹)' },
  { key: 'basicSalary', label: 'Basic Salary (₹)' },
  { key: 'hra', label: 'House Rent Allowance (₹)' },
  { key: 'otherAllowance', label: 'Other Allowance (₹)' },
  { key: 'pfDeduction', label: 'PF Deduction (₹)' },
];

export default function PayrollEmployeeScreen({ route, navigation }) {
  const { employee } = route.params;
  const [tab, setTab] = useState('structure');

  const [struct, setStruct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDoj, setShowDoj] = useState(false);

  // Payslip (monthly) form
  const [monthDate, setMonthDate] = useState(new Date());
  const [monthly, setMonthly] = useState({
    basicSalary: '', hra: '', otherAllowance: '', bonusIncentives: '',
    workingDays: '', presentDays: '', pfDeduction: '', otherDeduction: '', notes: '',
  });
  const [generating, setGenerating] = useState(false);
  const [payslips, setPayslips] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const [s, p] = await Promise.all([
          payrollApi.getStructure(employee._id),
          payrollApi.listPayslips(employee._id),
        ]);
        setStruct(s.data);
        setPayslips(p.data || []);
        // Seed the monthly form with structure defaults (auto-fill + editable).
        setMonthly((m) => ({
          ...m,
          basicSalary: String(s.data.basicSalary ?? ''),
          hra: String(s.data.hra ?? ''),
          otherAllowance: String(s.data.otherAllowance ?? ''),
          pfDeduction: String(s.data.pfDeduction ?? ''),
        }));
      } catch (e) {
        Alert.alert('Error', 'Could not load payroll data.');
      } finally {
        setLoading(false);
      }
    })();
  }, [employee._id]);

  const setS = (k, v) => setStruct((p) => ({ ...p, [k]: v }));
  const setM = (k, v) => setMonthly((p) => ({ ...p, [k]: v }));

  const saveStructure = async () => {
    setSaving(true);
    try {
      const payload = {
        employeeCode: struct.employeeCode, department: struct.department,
        designation: struct.designation, location: struct.location,
        bankAccountNo: struct.bankAccountNo, aadharNo: struct.aadharNo, panNo: struct.panNo,
        dateOfJoining: struct.dateOfJoining,
        monthlyCTC: Number(struct.monthlyCTC) || 0,
        basicSalary: Number(struct.basicSalary) || 0,
        hra: Number(struct.hra) || 0,
        otherAllowance: Number(struct.otherAllowance) || 0,
        pfDeduction: Number(struct.pfDeduction) || 0,
      };
      const res = await payrollApi.saveStructure(employee._id, payload);
      setStruct(res.data);
      Alert.alert('Saved', 'Salary structure saved. You won’t need to re-enter this each month.');
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Could not save the structure.');
    } finally {
      setSaving(false);
    }
  };

  const n = (v) => Number(v) || 0;
  const gross = n(monthly.basicSalary) + n(monthly.hra) + n(monthly.otherAllowance) + n(monthly.bonusIncentives);
  const totalDed = n(monthly.pfDeduction) + n(monthly.otherDeduction);
  const net = gross - totalDed;

  const generate = async () => {
    setGenerating(true);
    try {
      const payload = {
        userId: employee._id,
        month: toMonthKey(monthDate),
        // identity snapshot from structure
        employeeCode: struct.employeeCode, department: struct.department,
        designation: struct.designation, location: struct.location,
        dateOfJoining: struct.dateOfJoining, monthlyCTC: n(struct.monthlyCTC),
        bankAccountNo: struct.bankAccountNo, aadharNo: struct.aadharNo, panNo: struct.panNo,
        // earnings / deductions (editable monthly)
        basicSalary: n(monthly.basicSalary), hra: n(monthly.hra),
        otherAllowance: n(monthly.otherAllowance), bonusIncentives: n(monthly.bonusIncentives),
        workingDays: n(monthly.workingDays), presentDays: n(monthly.presentDays),
        pfDeduction: n(monthly.pfDeduction), otherDeduction: n(monthly.otherDeduction),
        notes: monthly.notes,
      };
      const res = await payrollApi.createPayslip(payload);
      const refreshed = await payrollApi.listPayslips(employee._id);
      setPayslips(refreshed.data || []);
      Alert.alert('Payslip Generated', `${monthLabel(monthDate)} payslip created for ${employee.name}.`, [
        { text: 'View', onPress: () => navigation.navigate('PayslipDetail', { payslip: res.data }) },
        { text: 'OK' },
      ]);
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Could not generate the payslip.');
    } finally {
      setGenerating(false);
    }
  };

  const shiftMonth = (delta) => {
    setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() + delta, 1));
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={Theme.colors.primary} /></View>;
  }

  const dojDate = struct.dateOfJoining ? new Date(struct.dateOfJoining) : null;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        {/* Employee header */}
        <View style={styles.empHeader}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{(employee.name || 'U').substring(0, 2).toUpperCase()}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.empName}>{employee.name}</Text>
            <Text style={styles.empSub}>{employee.designation || employee.role}</Text>
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabRow}>
          {[['structure', 'Salary Structure'], ['payslip', 'Generate Payslip']].map(([k, lbl]) => (
            <TouchableOpacity key={k} style={[styles.tab, tab === k && styles.tabActive]} onPress={() => setTab(k)}>
              <Text style={[styles.tabText, tab === k && styles.tabTextActive]}>{lbl}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {tab === 'structure' ? (
            <>
              <Text style={styles.hint}>Fill this once. It auto-fills every monthly payslip — you only update the monthly numbers later.</Text>

              {STRUCT_TEXT.map((f) => (
                <Field key={f.key} label={f.label} value={String(struct[f.key] ?? '')} onChange={(v) => setS(f.key, v)} keyboardType={f.kb} />
              ))}

              {/* Date of joining */}
              <Text style={styles.fieldLabel}>Date of Joining</Text>
              <TouchableOpacity style={styles.input} onPress={() => setShowDoj(true)}>
                <Text style={{ color: dojDate ? Theme.colors.text : Theme.colors.textSecondary, fontFamily: Theme.typography.fontFamily }}>
                  {dojDate ? dojDate.toLocaleDateString('en-GB') : 'Select date'}
                </Text>
              </TouchableOpacity>
              {showDoj && (
                <DateTimePicker
                  value={dojDate || new Date()}
                  mode="date"
                  display="default"
                  onChange={(e, d) => { setShowDoj(false); if (e.type !== 'dismissed' && d) setS('dateOfJoining', d.toISOString()); }}
                />
              )}

              <View style={styles.divider} />
              <Text style={styles.subHead}>Salary Breakdown</Text>
              {STRUCT_NUM.map((f) => (
                <Field key={f.key} label={f.label} value={String(struct[f.key] ?? '')} onChange={(v) => setS(f.key, v)} keyboardType="numeric" />
              ))}

              <TouchableOpacity style={[styles.primaryBtn, saving && { opacity: 0.7 }]} onPress={saveStructure} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <><Ionicons name="save-outline" size={18} color="#fff" /><Text style={styles.primaryBtnText}>Save Structure</Text></>}
              </TouchableOpacity>
            </>
          ) : (
            <>
              {/* Month selector */}
              <Text style={styles.fieldLabel}>Salary Month</Text>
              <View style={styles.monthRow}>
                <TouchableOpacity onPress={() => shiftMonth(-1)} style={styles.monthBtn}><Ionicons name="chevron-back" size={22} color={Theme.colors.primary} /></TouchableOpacity>
                <Text style={styles.monthText}>{monthLabel(monthDate)}</Text>
                <TouchableOpacity onPress={() => shiftMonth(1)} style={styles.monthBtn}><Ionicons name="chevron-forward" size={22} color={Theme.colors.primary} /></TouchableOpacity>
              </View>

              <Text style={styles.hint}>Earnings are pre-filled from the saved structure — edit any value for this month.</Text>

              <Field label="Basic Salary (₹)" value={monthly.basicSalary} onChange={(v) => setM('basicSalary', v)} keyboardType="numeric" />
              <Field label="House Rent Allowance (₹)" value={monthly.hra} onChange={(v) => setM('hra', v)} keyboardType="numeric" />
              <Field label="Other Allowance (₹)" value={monthly.otherAllowance} onChange={(v) => setM('otherAllowance', v)} keyboardType="numeric" />
              <Field label="Bonus / Incentives (₹)" value={monthly.bonusIncentives} onChange={(v) => setM('bonusIncentives', v)} keyboardType="numeric" />

              <View style={styles.twoCol}>
                <View style={{ flex: 1 }}><Field label="Working Days" value={monthly.workingDays} onChange={(v) => setM('workingDays', v)} keyboardType="numeric" /></View>
                <View style={{ flex: 1 }}><Field label="Present Days" value={monthly.presentDays} onChange={(v) => setM('presentDays', v)} keyboardType="numeric" /></View>
              </View>

              <Field label="PF Deduction (₹)" value={monthly.pfDeduction} onChange={(v) => setM('pfDeduction', v)} keyboardType="numeric" />
              <Field label="Other Deduction (₹)" value={monthly.otherDeduction} onChange={(v) => setM('otherDeduction', v)} keyboardType="numeric" />
              <Field label="Notes" value={monthly.notes} onChange={(v) => setM('notes', v)} multiline />

              {/* Live totals */}
              <View style={styles.totalsBox}>
                <View style={styles.totalRow}><Text style={styles.totalLbl}>Gross</Text><Text style={styles.totalVal}>{INR(gross)}</Text></View>
                <View style={styles.totalRow}><Text style={styles.totalLbl}>Deductions</Text><Text style={styles.totalVal}>{INR(totalDed)}</Text></View>
                <View style={[styles.totalRow, styles.netRow]}><Text style={styles.netLbl}>Net Payable</Text><Text style={styles.netVal}>{INR(net)}</Text></View>
              </View>

              <TouchableOpacity style={[styles.primaryBtn, generating && { opacity: 0.7 }]} onPress={generate} disabled={generating}>
                {generating ? <ActivityIndicator color="#fff" /> : <><Ionicons name="document-text-outline" size={18} color="#fff" /><Text style={styles.primaryBtnText}>Generate Payslip</Text></>}
              </TouchableOpacity>

              {/* History */}
              {payslips.length > 0 && (
                <>
                  <Text style={styles.subHead}>Generated Payslips</Text>
                  {payslips.map((p) => (
                    <TouchableOpacity key={p._id} style={styles.histRow} onPress={() => navigation.navigate('PayslipDetail', { payslip: p })}>
                      <Ionicons name="receipt-outline" size={18} color={Theme.colors.primary} />
                      <Text style={styles.histMonth}>{p.monthLabel}</Text>
                      <Text style={styles.histNet}>{INR(p.netPayable)}</Text>
                      <Ionicons name="chevron-forward" size={16} color={Theme.colors.textSecondary} />
                    </TouchableOpacity>
                  ))}
                </>
              )}
            </>
          )}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

function Field({ label, value, onChange, keyboardType, multiline }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && { height: 72, textAlignVertical: 'top' }]}
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType || 'default'}
        multiline={multiline}
        placeholder={label}
        placeholderTextColor={Theme.colors.textSecondary}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F2F5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F0F2F5' },

  empHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', padding: 16 },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: Theme.colors.primary + '15', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: Theme.typography.fontFamily, fontSize: 15, fontWeight: '700', color: Theme.colors.primary },
  empName: { fontFamily: Theme.typography.fontFamily, fontSize: 16, fontWeight: '800', color: Theme.colors.text },
  empSub: { fontFamily: Theme.typography.fontFamily, fontSize: 12, color: Theme.colors.textSecondary, marginTop: 2, textTransform: 'capitalize' },

  tabRow: { flexDirection: 'row', backgroundColor: '#fff', paddingHorizontal: 16, paddingBottom: 6, gap: 8, borderBottomWidth: 1, borderBottomColor: Theme.colors.border },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center', backgroundColor: '#F0F2F5' },
  tabActive: { backgroundColor: Theme.colors.primary },
  tabText: { fontFamily: Theme.typography.fontFamily, fontSize: 13, fontWeight: '700', color: Theme.colors.textSecondary },
  tabTextActive: { color: '#fff' },

  hint: { fontFamily: Theme.typography.fontFamily, fontSize: 12, color: Theme.colors.textSecondary, backgroundColor: Theme.colors.primary + '10', padding: 10, borderRadius: 8, marginBottom: 14, lineHeight: 17 },

  fieldLabel: { fontFamily: Theme.typography.fontFamily, fontSize: 12, color: Theme.colors.textSecondary, marginBottom: 6, fontWeight: '600' },
  input: {
    backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: Theme.colors.border,
    paddingHorizontal: 14, paddingVertical: 12, fontFamily: Theme.typography.fontFamily, fontSize: 14, color: Theme.colors.text,
  },

  divider: { height: 1, backgroundColor: Theme.colors.border, marginVertical: 10 },
  subHead: { fontFamily: Theme.typography.fontFamily, fontSize: 14, fontWeight: '800', color: Theme.colors.text, marginBottom: 12, marginTop: 6 },

  twoCol: { flexDirection: 'row', gap: 12 },

  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: Theme.colors.border, paddingHorizontal: 8, paddingVertical: 6, marginBottom: 14 },
  monthBtn: { padding: 6 },
  monthText: { fontFamily: Theme.typography.fontFamily, fontSize: 15, fontWeight: '700', color: Theme.colors.text },

  totalsBox: { backgroundColor: '#FAF8F0', borderWidth: 1, borderColor: '#E5DFC8', borderRadius: 12, padding: 14, marginTop: 4, marginBottom: 16 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5 },
  totalLbl: { fontFamily: Theme.typography.fontFamily, fontSize: 13, color: Theme.colors.textSecondary },
  totalVal: { fontFamily: Theme.typography.fontFamily, fontSize: 13, color: Theme.colors.text, fontWeight: '600' },
  netRow: { borderTopWidth: 1, borderTopColor: '#E5DFC8', marginTop: 4, paddingTop: 10 },
  netLbl: { fontFamily: Theme.typography.fontFamily, fontSize: 15, fontWeight: '800', color: Theme.colors.text },
  netVal: { fontFamily: Theme.typography.fontFamily, fontSize: 18, fontWeight: '800', color: Theme.colors.primary },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Theme.colors.primary, borderRadius: 12, paddingVertical: 15, marginTop: 6,
  },
  primaryBtnText: { fontFamily: Theme.typography.fontFamily, fontSize: 15, fontWeight: '700', color: '#fff' },

  histRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8 },
  histMonth: { flex: 1, fontFamily: Theme.typography.fontFamily, fontSize: 13, fontWeight: '600', color: Theme.colors.text },
  histNet: { fontFamily: Theme.typography.fontFamily, fontSize: 13, fontWeight: '700', color: Theme.colors.primary },
});
