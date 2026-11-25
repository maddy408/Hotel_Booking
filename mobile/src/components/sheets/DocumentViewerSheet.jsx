import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { File } from 'expo-file-system';
import Sheet, { SheetHeader } from '../Sheet.jsx';
import Button from '../ui/Button.jsx';
import { fetchOccupantDocumentLocalFile, viewOccupantDocument } from '../../api/occupantDocuments';
import { fetchIdImageLocalFile } from '../../api/idImage';
import { colors, fonts, radii } from '../../theme/theme';

function formatFileSize(bytes) {
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentViewerSheet({ doc, onClose, onDelete }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [docData, setDocData] = useState(null);
  const [launchingViewer, setLaunchingViewer] = useState(false);

  const docId = doc?.id;
  const suggestedName = doc?.original_filename || 'document';

  const loadDocument = async () => {
    if (doc?.isGuestIdDoc && doc?.guestId) {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchIdImageLocalFile(doc.guestId);
        setDocData(data);
        if (data.mime === 'application/pdf') {
          try {
            const file = new File(data.uri);
            await File.preview(file, { mimeType: data.mime });
          } catch (previewErr) {
            console.warn('Auto-preview failed:', previewErr);
          }
        }
      } catch (e) {
        setError(e.message || 'Could not load the ID document.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!docId) {
      setError('Document ID is missing.');
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const data = await fetchOccupantDocumentLocalFile(docId, suggestedName);
      setDocData(data);

      // If document is PDF, automatically launch the Android document viewer for reading
      if (data.mime === 'application/pdf') {
        try {
          await viewOccupantDocument(docId, suggestedName);
        } catch (previewErr) {
          // If auto-launch fails, user still has the manual button
          console.warn('Auto-preview failed:', previewErr);
        }
      }
    } catch (e) {
      setError(e.message || 'Could not load the document.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocument();
  }, [docId]);

  const handleOpenSystemViewer = async () => {
    try {
      setLaunchingViewer(true);
      if (doc?.isGuestIdDoc && docData?.uri) {
        const file = new File(docData.uri);
        await File.preview(file, { mimeType: docData.mime });
      } else {
        await viewOccupantDocument(docId, suggestedName);
      }
    } catch (e) {
      setError(e.message || 'Could not open document in viewer.');
    } finally {
      setLaunchingViewer(false);
    }
  };

  const isImage = docData?.mime?.startsWith('image/');
  const isPdf = docData?.mime === 'application/pdf';

  return (
    <Sheet onClose={onClose} scroll={false}>
      <SheetHeader
        title={suggestedName}
        subtitle={doc?.document_type || (isPdf ? 'PDF Document' : 'ID Proof')}
        onBack={onClose}
        onClose={onClose}
      />

      <View style={styles.container}>
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Retrieving document…</Text>
          </View>
        ) : error ? (
          <View style={styles.centered}>
            <Text style={styles.errorIcon}>⚠️</Text>
            <Text style={styles.errorTitle}>Document Error</Text>
            <Text style={styles.errorMessage}>{error}</Text>
            <View style={styles.actionRow}>
              <Button title="Retry" variant="primary" size="sm" onPress={loadDocument} />
              <Button title="Close" variant="outline" size="sm" onPress={onClose} />
            </View>
          </View>
        ) : isImage ? (
          <View style={styles.imageWrapper}>
            <ScrollView
              style={styles.imageScroll}
              contentContainerStyle={styles.imageScrollContent}
              maximumZoomScale={3}
              minimumZoomScale={1}
            >
              <Image
                source={{ uri: docData.uri }}
                style={styles.fullImage}
                resizeMode="contain"
              />
            </ScrollView>
            <View style={styles.footerBar}>
              <Text style={styles.metaText}>
                {formatFileSize(docData.size)} · Image
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                {onDelete ? (
                  <Button
                    title="🗑️ Delete"
                    variant="danger"
                    size="sm"
                    onPress={() => onDelete(docId)}
                  />
                ) : null}
                <Button
                  title={launchingViewer ? 'Opening…' : 'Open in System Viewer'}
                  variant="outline"
                  size="sm"
                  loading={launchingViewer}
                  onPress={handleOpenSystemViewer}
                />
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.centered}>
            <View style={styles.pdfCard}>
              <Text style={styles.pdfIcon}>📄</Text>
              <Text style={styles.pdfTitle} numberOfLines={2}>
                {suggestedName}
              </Text>
              <Text style={styles.pdfMeta}>
                {isPdf ? 'PDF Document' : docData?.mime || 'Document'} · {formatFileSize(docData?.size)}
              </Text>
              <Text style={styles.pdfDesc}>
                Opened in your device’s document viewer. If it didn't open automatically, tap below.
              </Text>
              <View style={{ marginTop: 16, width: '100%', gap: 10 }}>
                <Button
                  title={launchingViewer ? 'Opening…' : '📖 Open in Document Viewer'}
                  variant="primary"
                  size="md"
                  loading={launchingViewer}
                  onPress={handleOpenSystemViewer}
                />
                {onDelete ? (
                  <Button
                    title="🗑️ Delete Document"
                    variant="danger"
                    size="md"
                    onPress={() => onDelete(docId)}
                  />
                ) : null}
                <Button
                  title="Close Document"
                  variant="outline"
                  size="md"
                  onPress={onClose}
                />
              </View>
            </View>
          </View>
        )}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 12,
  },
  errorIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  errorTitle: {
    fontFamily: fonts.displaySemibold,
    fontSize: 16,
    color: colors.danger,
    marginBottom: 6,
  },
  errorMessage: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 18,
    maxWidth: 280,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  imageWrapper: {
    flex: 1,
  },
  imageScroll: {
    flex: 1,
    backgroundColor: '#0F0F1A',
  },
  imageScrollContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullImage: {
    width: '100%',
    height: '100%',
  },
  footerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  metaText: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.textSecondary,
  },
  pdfCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 20,
    alignItems: 'center',
  },
  pdfIcon: {
    fontSize: 48,
    marginBottom: 10,
  },
  pdfTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: colors.heading,
    textAlign: 'center',
    marginBottom: 6,
  },
  pdfMeta: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.primary,
    marginBottom: 8,
  },
  pdfDesc: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 16,
  },
});
