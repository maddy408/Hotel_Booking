import { useState, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View, Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import Screen, { ErrorState, LoadingState } from '../../components/ui/Screen.jsx';
import Button from '../../components/ui/Button.jsx';
import GuestEditSheet from '../../components/sheets/GuestEditSheet.jsx';
import NewBookingSheet from '../../components/sheets/NewBookingSheet.jsx';
import BookingDetailSheet from '../../components/sheets/BookingDetailSheet.jsx';
import CheckoutSheet from '../../components/sheets/CheckoutSheet.jsx';
import { useGuest, useDeleteGuest } from '../../api/guests';
import { useUploadIdImage, useDeleteIdImage } from '../../api/idImage';
import { viewOccupantDocument, useDeleteOccupantDocument } from '../../api/occupantDocuments';
import DocumentViewerSheet from '../../components/sheets/DocumentViewerSheet.jsx';
import { useToast } from '../../components/ToastContext.jsx';
import { fd, inr } from '../../lib/format';
import { colors, fonts, radii } from '../../theme/theme';

export default function GuestDetailsScreen({ route, navigation }) {
  const { guestId } = route.params;
  const { data: guest, isLoading, isError, error, refetch, isRefetching } = useGuest(guestId);
  const uploadIdImage = useUploadIdImage();
  const deleteIdImage = useDeleteIdImage();
  const deleteDoc = useDeleteOccupantDocument();
  const deleteGuest = useDeleteGuest();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState('personal');
  const [sheet, setSheet] = useState(null);
  const [loadingDocId, setLoadingDocId] = useState(null);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [deletingGuest, setDeletingGuest] = useState(false);
  const isUploadingDocRef = useRef(false);

  const bookings = guest?.bookings || [];
  const stays = guest?.stays || [];
  const payments = guest?.payments || [];
  const referrals = guest?.referrals || guest?.referred_guests || [];
  const referredBy = guest?.referred_by || guest?.referredBy || null;

  // Aggregate documents across profile, stays, occupants, and bookings
  const documents = useMemo(() => {
    if (!guest) return [];
    const list = [...(guest.documents || [])];
    const seenIds = new Set(list.map((d) => d.id));

    for (const st of stays) {
      for (const d of st.documents || []) {
        if (!seenIds.has(d.id)) {
          seenIds.add(d.id);
          list.push({ ...d, related_label: d.related_label || `Stay #${st.id} (Room ${st.room_no})` });
        }
      }
      for (const occ of st.occupants || []) {
        for (const d of occ.documents || []) {
          if (!seenIds.has(d.id)) {
            seenIds.add(d.id);
            list.push({
              ...d,
              occupant_name: occ.name,
              is_primary: occ.is_primary,
              related_label: d.related_label || `Stay #${st.id} (Room ${st.room_no})`,
            });
          }
        }
      }
    }

    for (const bk of bookings) {
      for (const d of bk.documents || []) {
        if (!seenIds.has(d.id)) {
          seenIds.add(d.id);
          list.push({ ...d, related_label: d.related_label || `Booking ${bk.booking_code || '#' + bk.id}` });
        }
      }
    }
    return list;
  }, [guest, stays, bookings]);

  const outstandingBalance = guest?.summary?.outstandingBalance ?? guest?.payment_summary?.outstandingBalance ?? 0;

  const currentStayStatusText = guest?.now?.type === 'in_house'
    ? `Room ${guest.now.roomNo} · In-House`
    : guest?.now?.type === 'booked'
      ? `Room ${guest.now.roomNo} · Booked (${fd(guest.now.bookingDate)})`
      : 'Not Staying';

  const paymentSummary = guest?.payment_summary || {
    totalPaid: payments.filter((p) => (p.status || 'successful') === 'successful' && p.type !== 'refund').reduce((acc, p) => acc + Number(p.amount), 0) -
      payments.filter((p) => (p.status || 'successful') === 'successful' && p.type === 'refund').reduce((acc, p) => acc + Number(p.amount), 0),
    advanceTotal: payments.filter((p) => (p.status || 'successful') === 'successful' && p.type === 'advance').reduce((acc, p) => acc + Number(p.amount), 0),
    additionalTotal: payments.filter((p) => (p.status || 'successful') === 'successful' && (p.type === 'balance' || p.type === 'extra')).reduce((acc, p) => acc + Number(p.amount), 0),
    refundTotal: payments.filter((p) => (p.status || 'successful') === 'successful' && p.type === 'refund').reduce((acc, p) => acc + Number(p.amount), 0),
    totalRoomCharges: stays.reduce((acc, s) => acc + (Number(s.rate || 0) * Number(s.nights || 1)), 0),
    totalGst: stays.reduce((acc, s) => acc + Math.round((Number(s.rate || 0) * Number(s.nights || 1) * 0.05) * 100) / 100, 0),
    outstandingBalance,
  };

  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || !result.assets[0]) return;
      const asset = result.assets[0];

      // Size check (10 MB)
      if (asset.size && asset.size > 10 * 1024 * 1024) {
        const msg = 'Document must be 10 MB or smaller.';
        toast(msg);
        Alert.alert('File Too Large', msg);
        return;
      }

      // Format check
      const ext = (asset.name || '').split('.').pop().toLowerCase();
      const MIME_MAP = {
        pdf: 'application/pdf',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
      };
      const mime = MIME_MAP[ext] || asset.mimeType || 'application/pdf';

      setSelectedDoc({
        uri: asset.uri,
        name: asset.name || `guest-${guestId}-id.${ext}`,
        type: mime,
        size: asset.size,
      });
    } catch (e) {
      toast(e.message || 'Could not attach document.');
    }
  };

  const handleUploadSelectedDoc = async () => {
    if (!selectedDoc || !guestId) return;
    if (isUploadingDocRef.current || uploadIdImage.isPending) return;

    isUploadingDocRef.current = true;
    try {
      const file = {
        uri: selectedDoc.uri,
        name: selectedDoc.name,
        type: selectedDoc.type,
      };
      await uploadIdImage.mutateAsync({ guestId, file });
      toast('Guest ID document uploaded successfully.');
      setSelectedDoc(null);
      refetch();
    } catch (e) {
      toast(e.message || 'Document upload failed. Check connection.');
    } finally {
      isUploadingDocRef.current = false;
    }
  };

  const handleViewPrimaryDoc = () => {
    setSheet({
      type: 'document',
      doc: {
        id: null,
        isGuestIdDoc: true,
        guestId,
        original_filename: `${guest.name || 'Guest'} ID Document`,
        document_type: guest.id_proof_type || 'Identity Proof',
      },
    });
  };

  const handleOpenDoc = (doc) => {
    setSheet({ type: 'document', doc });
  };

  const handleDeleteDoc = (docId) => {
    Alert.alert(
      'Delete Document',
      'Are you sure you want to delete this document?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoc.mutateAsync({ docId });
              toast('Document deleted.');
              refetch();
            } catch (e) {
              toast(e.message || 'Failed to delete document.');
            }
          },
        },
      ]
    );
  };

  const handleDeletePrimaryDoc = () => {
    Alert.alert(
      'Delete Primary ID Document',
      `Are you sure you want to delete the ID document for ${guest.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteIdImage.mutateAsync({ guestId });
              toast('Primary ID document deleted.');
              refetch();
            } catch (e) {
              toast(e.message || 'Failed to delete document.');
            }
          },
        },
      ]
    );
  };

  const handleDeleteGuest = () => {
    if (!guest || deletingGuest) return;
    Alert.alert(
      'Delete Guest',
      `Are you sure you want to delete ${guest.name}? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingGuest(true);
            try {
              await deleteGuest.mutateAsync(guestId);
              toast(`Guest ${guest.name} deleted.`);
              navigation.navigate('Guests');
            } catch (e) {
              const msg = e.message || 'Cannot delete guest.';
              toast(msg);
              const bookingId = e.fields?.bookingId;
              const buttons = [{ text: 'OK', style: 'cancel' }];
              if (bookingId) {
                buttons.push({
                  text: 'View Booking',
                  onPress: () => setSheet({ type: 'booking', id: Number(bookingId) }),
                });
              }
              Alert.alert('Cannot Delete Guest', msg, buttons);
            } finally {
              setDeletingGuest(false);
            }
          },
        },
      ]
    );
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  if (isLoading) return <Screen><LoadingState /></Screen>;
  if (isError) return <Screen><ErrorState message={error?.message} onRetry={refetch} /></Screen>;
  if (!guest) return null;

  const totalDocumentsCount = documents.length + (guest.hasIdImage || guest.id_image_path ? 1 : 0);

  const tabs = [
    { key: 'personal', label: 'Personal' },
    { key: 'bookings', label: `Bookings (${bookings.length})` },
    { key: 'stays', label: `Stays (${stays.length})` },
    { key: 'documents', label: `Docs (${totalDocumentsCount})` },
    { key: 'payments', label: `Payments (${payments.length})` },
  ];

  return (
    <Screen onRefresh={refetch} refreshing={isRefetching}>
      {/* Top Header Card */}
      <View style={styles.headerCard}>
        <View style={styles.headerTop}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{guest.name ? guest.name.charAt(0).toUpperCase() : 'G'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
              <Text style={styles.guestName}>{guest.name}</Text>
              <View style={styles.idBadge}>
                <Text style={styles.idBadgeText}>Guest #{guest.id}</Text>
              </View>
            </View>

            <View style={{ marginTop: 4 }}>
              {guest.now?.type === 'in_house' ? (
                <View style={[styles.statusBadge, styles.badgeOccupied]}>
                  <Text style={[styles.statusText, styles.textOccupied]}>In Room {guest.now.roomNo}</Text>
                </View>
              ) : guest.now?.type === 'booked' ? (
                <View style={[styles.statusBadge, styles.badgeBooked]}>
                  <Text style={[styles.statusText, styles.textBooked]}>Booked for {fd(guest.now.bookingDate)}</Text>
                </View>
              ) : (
                <View style={[styles.statusBadge, styles.badgeDefault]}>
                  <Text style={[styles.statusText, styles.textDefault]}>Not Currently Staying</Text>
                </View>
              )}
            </View>

            <View style={styles.contactRow}>
              <Text style={styles.contactItem}>📱 <Text style={styles.monoText}>{guest.phone}</Text></Text>
              {guest.email ? <Text style={styles.contactItem}>✉️ {guest.email}</Text> : null}
              {guest.city ? <Text style={styles.contactItem}>📍 {guest.city}</Text> : null}
            </View>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.headerActions}>
          <Button
            title="✏️ Edit Profile"
            variant="outline"
            size="sm"
            onPress={() => setSheet({ type: 'edit' })}
          />
          <Button
            title="+ New Booking"
            variant="primary"
            size="sm"
            onPress={() => setSheet({ type: 'newBooking' })}
          />
          {guest.now?.type === 'in_house' && (
            <Button
              title={`Room ${guest.now.roomNo} · Open Bill`}
              variant="info"
              size="sm"
              onPress={() => setSheet({ type: 'checkout', stayId: guest.now.stayId })}
            />
          )}
          <Button
            title={deletingGuest ? 'Deleting…' : '🗑️ Delete Guest'}
            variant="danger"
            size="sm"
            loading={deletingGuest}
            disabled={deletingGuest || deleteGuest.isPending}
            onPress={handleDeleteGuest}
          />
        </View>
      </View>

      {/* 4 Summary Metric Cards */}
      <View style={styles.metricsGrid}>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Total Visits</Text>
          <Text style={styles.metricValue}>{guest.summary?.totalVisits ?? guest.visits ?? 0}</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Referrals Made</Text>
          <Text style={styles.metricValueSecondary}>{guest.summary?.referralsMade ?? referrals.length}</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Current Status</Text>
          <Text style={styles.metricStatusText} numberOfLines={1}>{currentStayStatusText}</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Outstanding</Text>
          <Text style={[styles.metricValue, outstandingBalance > 0 && styles.metricAlert]}>
            {inr(outstandingBalance)}
          </Text>
        </View>
      </View>

      {/* Referral Information Box */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionHeading}>Referral Information</Text>
        <Text style={styles.sectionSub}>Referral relationship and guests registered through this member</Text>

        {/* Referred By */}
        <View style={styles.refByBox}>
          <Text style={styles.refByLabel}>Referred By:</Text>
          {referredBy ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, flex: 1 }}>
              <Pressable onPress={() => navigation.navigate('GuestDetails', { guestId: referredBy.id })}>
                <Text style={styles.refByLink}>{referredBy.name}</Text>
              </Pressable>
              <Text style={styles.monoText}>({referredBy.phone})</Text>
              <Text style={styles.metaSub}>Guest #{referredBy.id}</Text>
              <Button
                title="View Profile"
                variant="outline"
                size="sm"
                onPress={() => navigation.navigate('GuestDetails', { guestId: referredBy.id })}
              />
            </View>
          ) : (
            <Text style={styles.metaSub}>None (Direct registration / Walk-in / Social Media)</Text>
          )}
        </View>

        {/* People Referred */}
        <Text style={styles.subHeading}>People Referred by This Guest ({referrals.length})</Text>
        {referrals.length === 0 ? (
          <Text style={styles.emptyText}>No guests referred by this member yet.</Text>
        ) : (
          referrals.map((rg, idx) => (
            <View
              key={`${rg.guest_id || rg.id}-${idx}`}
              style={styles.referredItem}
            >
              <Pressable
                style={{ flex: 1 }}
                onPress={() => navigation.navigate('GuestDetails', { guestId: rg.guest_id || rg.id })}
              >
                <Text style={styles.refName}>{rg.name || rg.referred_guest_name}</Text>
                <Text style={styles.monoText}>{rg.phone || rg.referred_guest_phone}</Text>
                {rg.booking_code && (
                  <Text style={styles.metaSub}>
                    Booking: {rg.booking_code} · Room {rg.room_no || '—'}
                  </Text>
                )}
                {rg.check_in_date && (
                  <Text style={styles.metaSub}>Check-in: {fd(rg.check_in_date)}</Text>
                )}
              </Pressable>
              <Button
                title="Profile →"
                variant="outline"
                size="sm"
                onPress={() => navigation.navigate('GuestDetails', { guestId: rg.guest_id || rg.id })}
              />
            </View>
          ))
        )}
      </View>

      {/* Tabs Row */}
      <View style={styles.tabsRow}>
        {tabs.map((tab) => (
          <Pressable
            key={tab.key}
            style={[styles.tabChip, activeTab === tab.key && styles.tabChipActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabChipText, activeTab === tab.key && styles.tabChipTextActive]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* TAB CONTENT */}

      {/* 1. PERSONAL INFORMATION */}
      {activeTab === 'personal' && (
        <View style={styles.tabContent}>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Full Name</Text>
            <Text style={styles.fieldVal}>{guest.name || '—'}</Text>
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Mobile Number</Text>
            <Text style={styles.fieldValMono}>{guest.phone || '—'}</Text>
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Email Address</Text>
            <Text style={styles.fieldVal}>{guest.email || '—'}</Text>
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Gender</Text>
            <Text style={styles.fieldVal}>{guest.gender || '—'}</Text>
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>City / Location</Text>
            <Text style={styles.fieldVal}>{guest.city || '—'}</Text>
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Full Address</Text>
            <Text style={styles.fieldVal}>{guest.address || '—'}</Text>
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>ID Proof Type</Text>
            <Text style={styles.fieldVal}>{guest.idProofType || guest.id_proof_type || 'Aadhaar'}</Text>
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>ID Proof Number</Text>
            <Text style={styles.fieldVal}>
              {guest.id_proof_number || (guest.id_proof_last4 ? `••••${guest.id_proof_last4}` : '—')}
            </Text>
          </View>
          {Boolean(guest.isForeign || guest.is_foreign) && (
            <>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Nationality</Text>
                <Text style={styles.fieldVal}>{guest.nationality || 'Foreign National'}</Text>
              </View>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Visa Expiry</Text>
                <Text style={styles.fieldVal}>{guest.visaExpiry || guest.visa_expiry ? fd(guest.visaExpiry || guest.visa_expiry) : '—'}</Text>
              </View>
            </>
          )}

          {/* Identity Document upload & view */}
          <View style={styles.docSection}>
            <Text style={styles.fieldLabel}>Identity Document</Text>

            {/* Staged unuploaded document */}
            {selectedDoc ? (
              <View style={styles.selectedDocBox}>
                <Text style={styles.selectedDocName} numberOfLines={1}>{selectedDoc.name}</Text>
                <Text style={styles.selectedDocMeta}>
                  {selectedDoc.type === 'application/pdf' ? 'PDF Document' : 'Scanned ID'} {selectedDoc.size ? `· ${formatFileSize(selectedDoc.size)}` : ''}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                  <Button
                    title={uploadIdImage.isPending ? 'Uploading…' : 'Upload ID Document'}
                    variant="primary"
                    size="sm"
                    loading={uploadIdImage.isPending}
                    disabled={uploadIdImage.isPending}
                    onPress={handleUploadSelectedDoc}
                  />
                  <Button
                    title="Remove Selected Document"
                    variant="outline"
                    size="sm"
                    disabled={uploadIdImage.isPending}
                    onPress={() => setSelectedDoc(null)}
                  />
                </View>
              </View>
            ) : null}

            {!selectedDoc && (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                <Button
                  title="Attach Document"
                  variant="outline"
                  size="sm"
                  onPress={handlePickDocument}
                />
                {(guest.hasIdImage || guest.id_image_path) && (
                  <Button
                    title="View Document"
                    variant="outline"
                    size="sm"
                    onPress={handleViewPrimaryDoc}
                  />
                )}
              </View>
            )}
          </View>
        </View>
      )}

      {/* 2. BOOKINGS */}
      {activeTab === 'bookings' && (
        <View style={styles.tabContent}>
          {bookings.length === 0 ? (
            <Text style={styles.emptyText}>No reservations recorded for this guest.</Text>
          ) : (
            bookings.map((bk) => (
              <View
                key={bk.id}
                style={styles.cardItem}
              >
                <Pressable onPress={() => setSheet({ type: 'booking', id: bk.id })}>
                  <View style={styles.rowBetween}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.cardItemTitle}>{bk.booking_code || `Booking #${bk.id}`}</Text>
                      <View style={styles.tagBadge}>
                        <Text style={styles.tagBadgeText}>Room {bk.room_no || '—'}</Text>
                      </View>
                    </View>
                    <View style={[styles.statusBadge, styles.badgeBooked]}>
                      <Text style={[styles.statusText, styles.textBooked]}>{(bk.status || 'pending').toUpperCase()}</Text>
                    </View>
                  </View>

                  <Text style={styles.metaSub}>
                    {fd(bk.check_in_date)} → {fd(bk.check_out_date)} ({bk.nights || 1} night{bk.nights > 1 ? 's' : ''})
                  </Text>
                  <Text style={styles.metaSub}>Persons: {bk.persons || 1} · Rate: {inr(bk.rate)} / day</Text>
                </Pressable>

                <View style={styles.rowBetween}>
                  <Text style={styles.cardItemSub}>
                    Advance: {inr(bk.advance_amount || 0)} · Total: {inr(bk.total_amount || 0)}
                  </Text>
                  <Button
                    title="View Booking →"
                    variant="outline"
                    size="sm"
                    onPress={() => setSheet({ type: 'booking', id: bk.id })}
                  />
                </View>
              </View>
            ))
          )}
        </View>
      )}

      {/* 3. STAYS & OCCUPANTS */}
      {activeTab === 'stays' && (
        <View style={styles.tabContent}>
          {stays.length === 0 ? (
            <Text style={styles.emptyText}>No stay history found for this guest.</Text>
          ) : (
            stays.map((st) => (
              <View key={st.id} style={styles.cardItem}>
                <View style={styles.rowBetween}>
                  <Text style={styles.cardItemTitle}>Stay #{st.id} · Room {st.room_no}</Text>
                  <View style={[styles.statusBadge, st.status === 'in_house' ? styles.badgeOccupied : styles.badgeDefault]}>
                    <Text style={[styles.statusText, st.status === 'in_house' ? styles.textOccupied : styles.textDefault]}>
                      {(st.status || 'checked_out').toUpperCase()}
                    </Text>
                  </View>
                </View>

                <Text style={styles.metaSub}>
                  {fd(st.check_in_date)} → {fd(st.checkout_actual || st.checkout_planned)} ({st.nights || 1} night{st.nights > 1 ? 's' : ''})
                </Text>
                <Text style={styles.metaSub}>Rate: {inr(st.rate)} / day · {st.persons || 1} Person(s)</Text>

                {/* Occupants list */}
                {(st.occupants || []).length > 0 && (
                  <View style={styles.occListBox}>
                    <Text style={styles.occListHeading}>Occupants ({st.occupants.length})</Text>
                    {st.occupants.map((occ, oIdx) => (
                      <View key={oIdx} style={styles.occRow}>
                        <Text style={styles.occName}>{occ.name || 'Occupant'}</Text>
                        <Text style={styles.occRole}>
                          {occ.is_primary ? '(Lead / Primary)' : `(Person ${occ.occupant_number || oIdx + 1})`}
                        </Text>
                        {occ.phone ? <Text style={styles.monoSub}>{occ.phone}</Text> : null}
                      </View>
                    ))}
                  </View>
                )}

                <View style={[styles.rowBetween, { marginTop: 8 }]}>
                  <Button
                    title="View Invoice →"
                    variant="outline"
                    size="sm"
                    onPress={() => navigation.navigate('Bills', {
                      screen: 'InvoicePrint',
                      params: {
                        stayId: st.id,
                        stay: {
                          ...st,
                          guest_name: st.guest_name || guest.name,
                          guest_phone: st.guest_phone || guest.phone,
                          guest_gstin: st.guest_gstin || guest.id_proof_number || null,
                        },
                        guest,
                      },
                    })}
                  />
                  {st.status === 'in_house' && (
                    <Button
                      title="Checkout / Bill"
                      variant="info"
                      size="sm"
                      onPress={() => setSheet({ type: 'checkout', stayId: st.id })}
                    />
                  )}
                </View>
              </View>
            ))
          )}
        </View>
      )}

      {/* 4. DOCUMENTS */}
      {activeTab === 'documents' && (
        <View style={styles.tabContent}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <Text style={styles.sectionHeading}>ID Proof Documents ({totalDocumentsCount})</Text>
            <Button
              title="Attach Document"
              variant="outline"
              size="sm"
              onPress={handlePickDocument}
            />
          </View>

          {/* Staged unuploaded document */}
          {selectedDoc ? (
            <View style={[styles.selectedDocBox, { marginBottom: 12 }]}>
              <Text style={styles.selectedDocName} numberOfLines={1}>{selectedDoc.name}</Text>
              <Text style={styles.selectedDocMeta}>
                {selectedDoc.type === 'application/pdf' ? 'PDF Document' : 'Scanned ID'} {selectedDoc.size ? `· ${formatFileSize(selectedDoc.size)}` : ''}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                <Button
                  title={uploadIdImage.isPending ? 'Uploading…' : 'Upload ID Document'}
                  variant="primary"
                  size="sm"
                  loading={uploadIdImage.isPending}
                  disabled={uploadIdImage.isPending}
                  onPress={handleUploadSelectedDoc}
                />
                <Button
                  title="Remove Selected Document"
                  variant="outline"
                  size="sm"
                  disabled={uploadIdImage.isPending}
                  onPress={() => setSelectedDoc(null)}
                />
              </View>
            </View>
          ) : null}

          {/* Primary Guest ID Document if present */}
          {(guest.hasIdImage || guest.id_image_path) && (
            <View style={[styles.docItem, { borderColor: colors.primary }]}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[styles.docBadge, { backgroundColor: colors.primaryBg, color: colors.primary }]}>
                    {guest.id_proof_type || 'Primary ID'}
                  </Text>
                  <Text style={styles.docName} numberOfLines={1}>{guest.name} ID Document</Text>
                </View>
                <Text style={styles.docMeta}>Profile Document · Primary Guest</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                <Button
                  title="View Document"
                  variant="outline"
                  size="sm"
                  onPress={handleViewPrimaryDoc}
                />
                <Pressable onPress={handleDeletePrimaryDoc} style={{ padding: 4 }} accessibilityRole="button" accessibilityLabel="Delete Primary ID Document">
                  <Text style={{ color: colors.danger, fontSize: 16 }}>🗑️</Text>
                </Pressable>
              </View>
            </View>
          )}

          {documents.length === 0 && !(guest.hasIdImage || guest.id_image_path) ? (
            <Text style={styles.emptyText}>No ID proof documents uploaded yet.</Text>
          ) : (
            documents.map((doc) => (
              <View key={doc.id} style={styles.docItem}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.docBadge}>{doc.document_type || 'ID Proof'}</Text>
                    <Text style={styles.docName} numberOfLines={1}>{doc.original_filename || 'document'}</Text>
                  </View>
                  <Text style={styles.docMeta}>
                    Occupant: {doc.occupant_name || guest.name} · {formatFileSize(doc.file_size)}
                  </Text>
                  {doc.related_label ? <Text style={styles.docMeta}>{doc.related_label}</Text> : null}
                </View>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  <Button
                    title={loadingDocId === doc.id ? 'Loading…' : 'View Document'}
                    variant="outline"
                    size="sm"
                    loading={loadingDocId === doc.id}
                    onPress={() => handleOpenDoc(doc)}
                  />
                  <Pressable onPress={() => handleDeleteDoc(doc.id)} style={{ padding: 4 }} accessibilityRole="button" accessibilityLabel="Delete Document">
                    <Text style={{ color: colors.danger, fontSize: 16 }}>🗑️</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </View>
      )}

      {/* 5. PAYMENTS */}
      {activeTab === 'payments' && (
        <View style={styles.tabContent}>
          {/* Financial summary box */}
          <View style={styles.paymentSummaryBox}>
            <Text style={styles.sectionHeading}>Financial Summary</Text>
            <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Total Paid</Text><Text style={styles.summaryValBold}>{inr(paymentSummary.totalPaid)}</Text></View>
            <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Advance Collected</Text><Text style={styles.summaryVal}>{inr(paymentSummary.advanceTotal)}</Text></View>
            <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Additional Collected</Text><Text style={styles.summaryVal}>{inr(paymentSummary.additionalTotal)}</Text></View>
            {paymentSummary.refundTotal > 0 && (
              <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Refunded</Text><Text style={[styles.summaryVal, { color: colors.danger }]}>−{inr(paymentSummary.refundTotal)}</Text></View>
            )}
            <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Total Room Charges</Text><Text style={styles.summaryVal}>{inr(paymentSummary.totalRoomCharges)}</Text></View>
            <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Total GST</Text><Text style={styles.summaryVal}>{inr(paymentSummary.totalGst)}</Text></View>
            <View style={[styles.summaryRow, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6, marginTop: 4 }]}>
              <Text style={styles.summaryValBold}>Outstanding Balance</Text>
              <Text style={[styles.summaryValBold, outstandingBalance > 0 && styles.metricAlert]}>
                {inr(outstandingBalance)}
              </Text>
            </View>
          </View>

          {/* Transactions list */}
          <Text style={[styles.subHeading, { marginTop: 14 }]}>Payment Transactions ({payments.length})</Text>
          {payments.length === 0 ? (
            <Text style={styles.emptyText}>No financial transactions found.</Text>
          ) : (
            payments.map((p) => {
              const isRefund = p.type === 'refund';
              return (
                <View key={p.id} style={styles.payItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.payRef}>{p.reference || `Payment #${p.id}`}</Text>
                    <Text style={styles.metaSub}>
                      Method: {(p.method || 'cash').toUpperCase()} · Type: {(p.type || 'payment').toUpperCase()}
                    </Text>
                    <Text style={styles.metaSub}>{p.created_at ? fd(p.created_at) : '—'}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.payAmount, isRefund && { color: colors.danger }]}>
                      {isRefund ? `−${inr(p.amount)}` : `+${inr(p.amount)}`}
                    </Text>
                    <View style={[styles.statusBadge, p.status === 'successful' ? styles.badgeOccupied : styles.badgeDefault]}>
                      <Text style={[styles.statusText, p.status === 'successful' ? styles.textOccupied : styles.textDefault]}>
                        {(p.status || 'successful').toUpperCase()}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </View>
      )}

      {/* Sheets / Modals */}
      {sheet?.type === 'edit' && (
        <GuestEditSheet
          guestId={guest.id}
          onClose={() => setSheet(null)}
          onSaved={() => refetch()}
          onDeleted={() => {
            setSheet(null);
            navigation.navigate('Guests');
          }}
          onViewBooking={(bookingId) => setSheet({ type: 'booking', id: Number(bookingId) })}
        />
      )}
      {sheet?.type === 'newBooking' && (
        <NewBookingSheet
          presetGuest={guest}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.type === 'booking' && (
        <BookingDetailSheet
          reservationId={sheet.id}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.type === 'checkout' && (
        <CheckoutSheet
          stayId={sheet.stayId}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet?.type === 'document' && (
        <DocumentViewerSheet
          doc={sheet.doc}
          onClose={() => setSheet(null)}
          onDelete={(docId) => {
            setSheet(null);
            handleDeleteDoc(docId);
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerCard: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 14,
    marginBottom: 12,
  },
  headerTop: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#FFFFFF', fontFamily: fonts.displayBold, fontSize: 18 },
  guestName: { fontFamily: fonts.displayBold, fontSize: 18, color: colors.heading },
  idBadge: { backgroundColor: colors.surfaceSecondary, paddingHorizontal: 6, paddingVertical: 1, borderRadius: radii.xs, borderWidth: 1, borderColor: colors.cardBorder },
  idBadgeText: { fontFamily: fonts.monoBold, fontSize: 11, color: colors.primary },
  contactRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 },
  contactItem: { fontFamily: fonts.body, fontSize: 12, color: colors.textSecondary },
  monoText: { fontFamily: fonts.mono, fontSize: 12, color: colors.heading },
  headerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  metricCard: { flex: 1, minWidth: '47%', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radii.sm, padding: 10 },
  metricLabel: { fontFamily: fonts.bodySemibold, fontSize: 10.5, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.3 },
  metricValue: { fontFamily: fonts.displayBold, fontSize: 18, color: colors.primary, marginTop: 3 },
  metricValueSecondary: { fontFamily: fonts.displayBold, fontSize: 18, color: colors.secondary, marginTop: 3 },
  metricStatusText: { fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.heading, marginTop: 4 },
  metricAlert: { color: colors.danger },
  sectionCard: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radii.md, padding: 14, marginBottom: 12 },
  sectionHeading: { fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.heading, textTransform: 'uppercase', letterSpacing: 0.3 },
  sectionSub: { fontFamily: fonts.body, fontSize: 11.5, color: colors.textSecondary, marginTop: 2, marginBottom: 10 },
  refByBox: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: radii.sm, padding: 10, marginBottom: 10 },
  refByLabel: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.heading, marginBottom: 4 },
  refByLink: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.primary, textDecorationLine: 'underline' },
  subHeading: { fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.heading, marginBottom: 6 },
  emptyText: { fontFamily: fonts.body, fontSize: 12, color: colors.textSecondary, fontStyle: 'italic', marginVertical: 4 },
  referredItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.surfaceSecondary, borderRadius: radii.sm, padding: 8, marginTop: 6 },
  refName: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.heading },
  metaSub: { fontFamily: fonts.body, fontSize: 11.5, color: colors.textSecondary, marginTop: 2 },
  tabsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  tabChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.full, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  tabChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabChipText: { fontFamily: fonts.bodySemibold, fontSize: 12, color: colors.textSecondary },
  tabChipTextActive: { color: '#FFFFFF', fontFamily: fonts.bodyBold },
  tabContent: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radii.md, padding: 14, marginBottom: 12, gap: 10 },
  fieldRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  fieldLabel: { fontFamily: fonts.bodySemibold, fontSize: 12.5, color: colors.textSecondary },
  fieldVal: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.heading, maxWidth: '60%', textAlign: 'right' },
  fieldValMono: { fontFamily: fonts.monoBold, fontSize: 12.5, color: colors.heading },
  docSection: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  selectedDocBox: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    padding: 10,
    marginVertical: 6,
  },
  selectedDocName: { fontFamily: fonts.bodySemibold, fontSize: 13, color: colors.text },
  selectedDocMeta: { fontFamily: fonts.mono, fontSize: 11.5, color: colors.textSecondary, marginTop: 2 },
  cardItem: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radii.sm, padding: 10, gap: 4 },
  cardItemTitle: { fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.heading },
  cardItemSub: { fontFamily: fonts.monoBold, fontSize: 12, color: colors.primary },
  tagBadge: { backgroundColor: colors.infoBg, borderRadius: 3, paddingHorizontal: 5, paddingVertical: 1 },
  tagBadgeText: { fontFamily: fonts.monoBold, fontSize: 10.5, color: colors.info },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: radii.xs },
  badgeOccupied: { backgroundColor: colors.infoBg },
  badgeBooked: { backgroundColor: colors.warningBg },
  badgeDefault: { backgroundColor: '#F1F5F9' },
  statusText: { fontFamily: fonts.bodyBold, fontSize: 10.5 },
  textOccupied: { color: colors.info },
  textBooked: { color: colors.warning },
  textDefault: { color: '#475569' },
  occListBox: { backgroundColor: colors.card, borderRadius: radii.xs, padding: 8, marginTop: 4, gap: 4 },
  occListHeading: { fontFamily: fonts.bodyBold, fontSize: 11.5, color: colors.heading, marginBottom: 2 },
  occRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  occName: { fontFamily: fonts.bodyBold, fontSize: 11.5, color: colors.heading },
  occRole: { fontFamily: fonts.body, fontSize: 10.5, color: colors.textSecondary },
  monoSub: { fontFamily: fonts.mono, fontSize: 11, color: colors.textSecondary },
  docItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surfaceSecondary, borderRadius: radii.sm, padding: 10, borderWidth: 1, borderColor: colors.borderSubtle },
  docBadge: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 3, paddingHorizontal: 5, paddingVertical: 1, fontFamily: fonts.bodyBold, fontSize: 10, color: colors.primary, textTransform: 'uppercase' },
  docName: { fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.heading, flex: 1 },
  docMeta: { fontFamily: fonts.body, fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  paymentSummaryBox: { backgroundColor: colors.surfaceSecondary, borderRadius: radii.sm, padding: 10, gap: 5 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  summaryLabel: { fontFamily: fonts.body, fontSize: 12, color: colors.textSecondary },
  summaryVal: { fontFamily: fonts.mono, fontSize: 12, color: colors.heading },
  summaryValBold: { fontFamily: fonts.monoBold, fontSize: 13, color: colors.heading },
  payItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.surfaceSecondary, borderRadius: radii.sm, padding: 10 },
  payRef: { fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.heading },
  payAmount: { fontFamily: fonts.monoBold, fontSize: 13.5, color: colors.success },
});
