import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { attendanceApi } from '../../api';
import { Theme } from '../../theme/Theme';

const toDateStr = (d) => d.toISOString().split('T')[0];
const fmtDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const fmtTime = (t) => (t ? new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--');

// Structured report layouts (mirror the punch-out form).
const FIELD_METRICS = [
  { key: 'freshPresentation', label: 'Fresh Presentation Done' },
  { key: 'followUpVisit', label: 'Follow up Visit' },
  { key: 'appointmentAssigned', label: 'Appointment Assigned' },
  { key: 'appointmentVisit', label: 'Appointment Visit' },
  { key: 'dealClosed', label: 'Deal Closed' },
];
const CALLING_METRICS = [
  { key: 'totalCalls', label: 'Total Dialed Calls' },
  { key: 'callsConnected', label: 'Total Connected Call' },
  { key: 'sameDaySchedule', label: 'Same Day Appointments Fixed' },
  { key: 'nextDaySchedule', label: 'Next Day Appointments Fixed' },
  { key: 'otherDaySchedule', label: 'Other Appointments' },
  { key: 'followUpMeeting', label: 'Follow-Up Meeting' },
  { key: 'meetingDone', label: 'Meeting Done' },
  { key: 'dealDone', label: 'Deals Closed' },
];

// Renders a report by its type: structured field / calling metrics, or the
// legacy free-text layout for older records.
function renderReportBody(report) {
  if (!report) return <Text style={styles.reportText}>—</Text>;

  if (report.type === 'field' || report.type === 'calling') {
    const metrics = report.type === 'calling' ? CALLING_METRICS : FIELD_METRICS;
    return (
      <>
        {metrics.map((m) => (
          <View key={m.key} style={styles.statRow}>
            <Text style={styles.statLabel}>{m.label}</Text>
            <Text style={styles.statValue}>{Number(report[m.key] || 0)}</Text>
          </View>
        ))}
        {report.type === 'calling' && report.remarks ? (
          <>
            <Text style={styles.reportLabel}>Remarks / Comments</Text>
            <Text style={styles.reportText}>{report.remarks}</Text>
          </>
        ) : null}
        {report.type === 'field' && report.workCategory ? (
          <>
            <Text style={styles.reportLabel}>Today's Work Category</Text>
            <Text style={styles.reportText}>{report.workCategory}</Text>
          </>
        ) : null}
      </>
    );
  }

  // Legacy free-text report.
  return (
    <>
      <Text style={styles.reportLabel}>Work summary</Text>
      <Text style={styles.reportText}>{report.summary || '—'}</Text>
      {report.tasksCompleted ? (
        <>
          <Text style={styles.reportLabel}>Key tasks / visits / deals</Text>
          <Text style={styles.reportText}>{report.tasksCompleted}</Text>
        </>
      ) : null}
      {report.plan ? (
        <>
          <Text style={styles.reportLabel}>Plan for tomorrow</Text>
          <Text style={styles.reportText}>{report.plan}</Text>
        </>
      ) : null}
    </>
  );
}

export default function DailyReportsScreen() {
  const [date, setDate] = useState(new Date());
  const [showDate, setShowDate] = useState(false);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async (day = date) => {
    try {
      const res = await attendanceApi.reports(toDateStr(day));
      setReports(res.data || []);
    } catch (e) {
      console.log('Error loading reports', e);
      setReports([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { setLoading(true); load(date); }, [date]));

  const onDate = (e, d) => {
    setShowDate(false);
    if (e?.type !== 'dismissed' && d) setDate(d);
  };

  // Aggregate the day's reports into overall Calling-team and Sales-team totals.
  const summary = useMemo(() => {
    const calling = reports.filter((r) => r.report?.type === 'calling');
    const field = reports.filter((r) => r.report?.type === 'field');
    const sum = (list, key) => list.reduce((s, r) => s + Number(r.report?.[key] || 0), 0);
    return {
      callingCount: calling.length,
      fieldCount: field.length,
      calling: CALLING_METRICS.map((m) => ({ ...m, total: sum(calling, m.key) })),
      field: FIELD_METRICS.map((m) => ({ ...m, total: sum(field, m.key) })),
    };
  }, [reports]);

  const SummaryCard = ({ title, count, metrics }) => (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryTitle}>{title} · {count} reported</Text>
      <View style={styles.summaryGrid}>
        {metrics.map((m) => (
          <View key={m.key} style={styles.summaryTile}>
            <Text style={styles.summaryNum}>{m.total}</Text>
            <Text style={styles.summaryLbl}>{m.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  const summaryHeader = reports.length ? (
    <View>
      {summary.callingCount > 0 && <SummaryCard title="📞 Calling Team" count={summary.callingCount} metrics={summary.calling} />}
      {summary.fieldCount > 0 && <SummaryCard title="🧑‍💼 Sales Team" count={summary.fieldCount} metrics={summary.field} />}
    </View>
  ) : null;

  const renderItem = ({ item }) => {
    const u = item.userId || {};
    const hrs = item.hoursWorked ? item.hoursWorked.toFixed(1) : '--';
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(u.name || 'U').substring(0, 2).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{u.name || 'Unknown'}</Text>
            <Text style={styles.role}>{u.role}</Text>
          </View>
          <View style={styles.timeCol}>
            <Text style={styles.timeText}>{fmtTime(item.punchIn?.time)} → {fmtTime(item.punchOut?.time)}</Text>
            <Text style={styles.hoursText}>{hrs} hrs</Text>
          </View>
        </View>

        <View style={styles.reportBody}>{renderReportBody(item.report)}</View>
      </View>
    );
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={Theme.colors.primary} /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.bar}>
        <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDate(true)}>
          <Ionicons name="calendar-outline" size={16} color={Theme.colors.primary} />
          <Text style={styles.dateText}>{fmtDate(date)}</Text>
          <Ionicons name="chevron-down" size={15} color={Theme.colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.countText}>{reports.length} report{reports.length === 1 ? '' : 's'}</Text>
      </View>
      {showDate && (
        <DateTimePicker value={date} mode="date" maximumDate={new Date()}
          display={Platform.OS === 'ios' ? 'inline' : 'calendar'} onChange={onDate} />
      )}

      <FlatList
        data={reports}
        keyExtractor={(item) => item._id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 14, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(date); }} tintColor={Theme.colors.primary} />}
        ListHeaderComponent={summaryHeader}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="document-text-outline" size={48} color={Theme.colors.border} />
            <Text style={styles.emptyText}>No reports for {fmtDate(date)}</Text>
            <Text style={styles.emptySub}>Reports appear here once employees punch out.</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F2F5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F0F2F5' },
  bar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: Theme.colors.border,
  },
  dateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F5F7FA', borderRadius: 10, borderWidth: 1, borderColor: Theme.colors.border,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  dateText: { fontFamily: Theme.typography.fontFamily, fontSize: 13, fontWeight: '700', color: Theme.colors.text },
  countText: { fontFamily: Theme.typography.fontFamily, fontSize: 12, color: Theme.colors.textSecondary, fontWeight: '600' },
  summaryCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: Theme.colors.primary + '22' },
  summaryTitle: { fontFamily: Theme.typography.fontFamily, fontSize: 14, fontWeight: '900', color: Theme.colors.text, marginBottom: 10 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  summaryTile: { backgroundColor: '#F5F7FA', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 6, alignItems: 'center', flexGrow: 1, flexBasis: '30%', minWidth: 90 },
  summaryNum: { fontFamily: Theme.typography.fontFamily, fontSize: 20, fontWeight: '900', color: Theme.colors.primary },
  summaryLbl: { fontFamily: Theme.typography.fontFamily, fontSize: 10, color: Theme.colors.textSecondary, textAlign: 'center', marginTop: 2 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 12, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Theme.colors.primary + '22', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: Theme.typography.fontFamily, fontSize: 14, fontWeight: '700', color: Theme.colors.primary },
  name: { fontFamily: Theme.typography.fontFamily, fontSize: 15, fontWeight: '800', color: Theme.colors.text },
  role: { fontFamily: Theme.typography.fontFamily, fontSize: 11, color: Theme.colors.textSecondary, textTransform: 'capitalize', marginTop: 1 },
  timeCol: { alignItems: 'flex-end' },
  timeText: { fontFamily: Theme.typography.fontFamily, fontSize: 11, color: Theme.colors.textSecondary, fontWeight: '600' },
  hoursText: { fontFamily: Theme.typography.fontFamily, fontSize: 12, color: Theme.colors.primary, fontWeight: '700', marginTop: 2 },
  reportBody: { marginTop: 10, borderTopWidth: 1, borderTopColor: '#EEF1F5', paddingTop: 10 },
  reportLabel: { fontFamily: Theme.typography.fontFamily, fontSize: 11, color: Theme.colors.textSecondary, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 8 },
  reportText: { fontFamily: Theme.typography.fontFamily, fontSize: 13, color: Theme.colors.text, marginTop: 4, lineHeight: 19 },
  statRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#F4F6F9',
  },
  statLabel: { flex: 1, fontFamily: Theme.typography.fontFamily, fontSize: 13, color: Theme.colors.text },
  statValue: { fontFamily: Theme.typography.fontFamily, fontSize: 15, fontWeight: '800', color: Theme.colors.primary, minWidth: 34, textAlign: 'right' },
  empty: { alignItems: 'center', paddingTop: 70, paddingHorizontal: 30 },
  emptyText: { fontFamily: Theme.typography.fontFamily, fontSize: 14, color: Theme.colors.textSecondary, marginTop: 12, fontWeight: '700' },
  emptySub: { fontFamily: Theme.typography.fontFamily, fontSize: 12, color: Theme.colors.textSecondary, marginTop: 6, textAlign: 'center' },
});
