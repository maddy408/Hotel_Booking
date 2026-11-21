import { useState, useRef, useEffect } from 'react';
import { ActivityIndicator, Alert, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Sheet, { SheetHeader } from '../Sheet.jsx';
import Button from '../ui/Button.jsx';
import { useUploadIdImage, fetchIdImageLocalUri } from '../../api/idImage';
import { useGuest } from '../../api/guests';
import { useToast } from '../ToastContext.jsx';
import { colors, fonts, radii } from '../../theme/theme';

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB per backend IdImageUploader

export default function PhotoUploadSheet({
  guestId: propGuestId,
  item,
  onClose,
  onSaved,
}) {
  const guestId = propGuestId || item?.guest_id || item?.id;
  const guestName = item?.guest_name || item?.name || 'Guest';
  const bookingCode = item?.booking_code;
  const roomNo = item?.room_no;

  const toast = useToast();
  const uploadIdImage = useUploadIdImage();
  const { data: guestData, refetch: refetchGuest } = useGuest(guestId);

  const [pendingPhoto, setPendingPhoto] = useState(null);
  const [savedPhotoUri, setSavedPhotoUri] = useState(null);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const isSubmittingRef = useRef(false);

  // Check if guest already has an ID image
  const hasExistingImage = Boolean(guestData?.hasIdImage || guestData?.id_image_path || item?.hasIdImage || item?.has_id_image);

  // Load existing photo if available
  useEffect(() => {
    let mounted = true;
    if (hasExistingImage && guestId && !savedPhotoUri) {
      setLoadingSaved(true);
      fetchIdImageLocalUri(guestId)
        .then((uri) => {
          if (mounted) setSavedPhotoUri(uri);
        })
        .catch(() => {
          // Silent catch on initial load
        })
        .finally(() => {
          if (mounted) setLoadingSaved(false);
        });
    }
    return () => {
      mounted = false;
    };
  }, [guestId, hasExistingImage]);

  const handlePickPhoto = async () => {
    setUploadError('');
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
      });

      if (result.canceled || !result.assets || !result.assets[0]) {
        return;
      }

      const asset = result.assets[0];

      // File size validation (5 MB limit)
      if (asset.fileSize && asset.fileSize > MAX_IMAGE_SIZE_BYTES) {
        const msg = 'Image must be 5 MB or smaller.';
        setUploadError(msg);
        toast(msg);
        Alert.alert('File Too Large', msg);
        return;
      }

      // MIME type validation
      const mime = asset.mimeType || 'image/jpeg';
      if (!mime.includes('image/jpeg') && !mime.includes('image/png') && !mime.includes('image/webp') && !mime.includes('image/jpg')) {
        const msg = 'Only JPEG, PNG, or WebP images are allowed.';
        setUploadError(msg);
        toast(msg);
        Alert.alert('Unsupported Format', msg);
        return;
      }

      setPendingPhoto({
        uri: asset.uri,
        name: asset.fileName || `guest-${guestId}-id.jpg`,
        type: mime,
        size: asset.fileSize,
      });
    } catch (e) {
      const msg = e.message || 'Could not pick photo from gallery.';
      setUploadError(msg);
      toast(msg);
    }
  };

  const handleSaveUpload = async () => {
    if (!pendingPhoto || !guestId) return;
    if (isSubmittingRef.current || uploadIdImage.isPending) return;

    isSubmittingRef.current = true;
    setUploadError('');

    try {
      const file = {
        uri: pendingPhoto.uri,
        name: pendingPhoto.name || `guest-${guestId}-id.jpg`,
        type: pendingPhoto.type || 'image/jpeg',
      };

      await uploadIdImage.mutateAsync({ guestId, file });

      // Confirm successful backend upload
      toast('Guest ID photo uploaded successfully.');
      setPendingPhoto(null);

      // Load and display saved photo directly from backend
      setLoadingSaved(true);
      try {
        const loadedUri = await fetchIdImageLocalUri(guestId);
        setSavedPhotoUri(loadedUri);
      } catch {
        // Fallback to local preview if fetch fails
        setSavedPhotoUri(pendingPhoto.uri);
      } finally {
        setLoadingSaved(false);
      }

      refetchGuest();
      if (onSaved) onSaved();
    } catch (e) {
      const msg = e.message || 'Photo upload failed. Check your connection.';
      setUploadError(msg);
      toast(msg);
    } finally {
      isSubmittingRef.current = false;
    }
  };

  const handleCancelPending = () => {
    setPendingPhoto(null);
    setUploadError('');
  };

  return (
    <Sheet onClose={onClose}>
      <SheetHeader
        title="Upload ID Photo"
        subtitle={guestName + (roomNo ? ` · Room ${roomNo}` : '') + (bookingCode ? ` · Booking ${bookingCode}` : '')}
        onClose={onClose}
      />
      <View style={styles.body}>
        {/* Error banner */}
        {uploadError ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>⚠️ {uploadError}</Text>
          </View>
        ) : null}

        {/* Selected Photo Preview with Save / Upload and Cancel Actions */}
        {pendingPhoto ? (
          <View style={styles.previewContainer}>
            <Text style={styles.sectionTitle}>Selected Photo Preview</Text>
            <View style={styles.imageFrame}>
              <Image source={{ uri: pendingPhoto.uri }} style={styles.previewImage} resizeMode="contain" />
            </View>
            <Text style={styles.fileMeta}>
              {pendingPhoto.name} {pendingPhoto.size ? `· ${(pendingPhoto.size / 1024).toFixed(1)} KB` : ''}
            </Text>

            <View style={styles.actionRow}>
              <Button
                title={uploadIdImage.isPending ? 'Uploading…' : 'Save / Upload'}
                variant="primary"
                size="md"
                loading={uploadIdImage.isPending}
                disabled={uploadIdImage.isPending}
                onPress={handleSaveUpload}
                style={{ flex: 1 }}
              />
              <Button
                title="Cancel / Remove"
                variant="outline"
                size="md"
                disabled={uploadIdImage.isPending}
                onPress={handleCancelPending}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        ) : (
          /* When no new photo selected: show gallery pick button & current saved photo */
          <View style={styles.pickSection}>
            <Button
              title="📷 Select Photo from Gallery"
              variant="primary"
              size="md"
              onPress={handlePickPhoto}
            />

            {loadingSaved ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.mutedText}>Loading saved photo…</Text>
              </View>
            ) : savedPhotoUri ? (
              <View style={styles.savedPhotoSection}>
                <Text style={styles.savedTitle}>✓ Current Saved ID Photo</Text>
                <View style={styles.imageFrame}>
                  <Image source={{ uri: savedPhotoUri }} style={styles.previewImage} resizeMode="contain" />
                </View>
                <Button
                  title="Replace Photo"
                  variant="outline"
                  size="sm"
                  onPress={handlePickPhoto}
                  style={{ marginTop: 8 }}
                />
              </View>
            ) : hasExistingImage ? (
              <View style={styles.savedPhotoSection}>
                <Text style={styles.mutedText}>ID Photo recorded in backend.</Text>
                <Button
                  title="View Saved Photo"
                  variant="outline"
                  size="sm"
                  onPress={async () => {
                    setLoadingSaved(true);
                    try {
                      const u = await fetchIdImageLocalUri(guestId);
                      setSavedPhotoUri(u);
                    } catch (e) {
                      toast(e.message || 'Could not load saved photo.');
                    } finally {
                      setLoadingSaved(false);
                    }
                  }}
                  style={{ marginTop: 8 }}
                />
              </View>
            ) : (
              <Text style={styles.emptyNote}>
                No ID photo uploaded yet. Tap above to select and upload a photo from gallery.
              </Text>
            )}

            <Button
              title="Close"
              variant="outline"
              size="md"
              onPress={onClose}
              style={{ marginTop: 12 }}
            />
          </View>
        )}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: {
    padding: 16,
    gap: 12,
  },
  errorBanner: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.dangerBorder,
    borderWidth: 1,
    borderRadius: radii.md,
    padding: 10,
    marginBottom: 8,
  },
  errorText: {
    fontFamily: fonts.bodySemibold,
    fontSize: 13,
    color: colors.danger,
  },
  previewContainer: {
    gap: 10,
    alignItems: 'center',
    width: '100%',
  },
  sectionTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.heading,
    alignSelf: 'flex-start',
  },
  imageFrame: {
    width: '100%',
    height: 220,
    borderRadius: radii.md,
    backgroundColor: '#0F172A',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  fileMeta: {
    fontFamily: fonts.mono,
    fontSize: 11.5,
    color: colors.textSecondary,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
    marginTop: 6,
  },
  pickSection: {
    gap: 14,
  },
  loadingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  savedPhotoSection: {
    gap: 8,
    marginTop: 6,
    alignItems: 'center',
    width: '100%',
  },
  savedTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.success,
    alignSelf: 'flex-start',
  },
  mutedText: {
    fontFamily: fonts.body,
    fontSize: 12.5,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  emptyNote: {
    fontFamily: fonts.body,
    fontSize: 12.5,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 14,
    lineHeight: 18,
  },
});
