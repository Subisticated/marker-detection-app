import { useState } from 'react';
import {
  View,
  Image,
  Text,
  FlatList,
  TouchableOpacity,
  Modal,
  Pressable,
  Share,
  Alert,
} from 'react-native';
import CameraScreen from '../../components/cameraScreen';
import { Buffer } from 'buffer';
import * as FileSystem from 'expo-file-system/legacy';
global.Buffer = Buffer;

export default function Index() {
  const [markers, setMarkers] = useState<string[]>([]);
  const [status, setStatus] = useState('Ready');
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  const handleMarkerDetected = (uri: string) => {
    setMarkers(prev => [uri, ...prev]);
  };

  const handleDownload = async () => {
    if (!previewUri) {
      return;
    }

    try {
      const fileName = `marker-${Date.now()}.jpg`;
      const destination = `${FileSystem.documentDirectory}${fileName}`;
      await FileSystem.copyAsync({ from: previewUri, to: destination });

      await Share.share({
        url: destination,
        message: 'Saved marker image',
      });
    } catch (error: unknown) {
      Alert.alert(
        'Download failed',
        error instanceof Error ? error.message : 'Unable to save the marker image.'
      );
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <CameraScreen
          onMarkerDetected={handleMarkerDetected}
          onStatusChange={setStatus}
        />
      </View>

      <View style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6, backgroundColor: '#f8fafc' }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: '#0f172a' }}>Status: {status}</Text>
        <Text style={{ marginTop: 4, color: '#334155' }}>Saved Markers: {markers.length}</Text>
      </View>

      <View style={{ maxHeight: 200, backgroundColor: '#f8fafc', paddingHorizontal: 8, paddingBottom: 8 }}>
        <FlatList
          data={markers}
          keyExtractor={(item, idx) => `${item}-${idx}`}
          numColumns={4}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={<Text style={{ color: '#64748b', padding: 8 }}>No markers detected yet.</Text>}
          renderItem={({ item }) => (
            <View
              style={{
                width: '25%',
                padding: 6,
              }}
            >
              <TouchableOpacity onPress={() => setPreviewUri(item)} activeOpacity={0.85}>
                <Image
                  source={{ uri: item }}
                  style={{
                    width: '100%',
                    aspectRatio: 1,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                  }}
                />
              </TouchableOpacity>
            </View>
          )}
        />
      </View>

      <Modal visible={!!previewUri} transparent animationType="fade" onRequestClose={() => setPreviewUri(null)}>
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.9)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 16,
          }}
        >
          <Pressable
            onPress={() => setPreviewUri(null)}
            style={{
              position: 'absolute',
              top: 48,
              right: 20,
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 18,
              backgroundColor: 'rgba(255,255,255,0.16)',
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>Close</Text>
          </Pressable>

          {previewUri ? (
            <>
              <Image
                source={{ uri: previewUri }}
                resizeMode="contain"
                style={{ width: '100%', height: '72%', borderRadius: 12 }}
              />
              <TouchableOpacity
                onPress={handleDownload}
                style={{
                  marginTop: 18,
                  backgroundColor: '#0f172a',
                  paddingHorizontal: 18,
                  paddingVertical: 12,
                  borderRadius: 12,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>Download</Text>
              </TouchableOpacity>
            </>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}