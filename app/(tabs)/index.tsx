import { useState } from 'react';
import { View, Image, Text, FlatList } from 'react-native';
import CameraScreen from '../../components/cameraScreen';
import { Buffer } from 'buffer';
global.Buffer = Buffer;

export default function Index() {
  const [markers, setMarkers] = useState<string[]>([]);
  const [status, setStatus] = useState('Ready');
  const [scanLogs, setScanLogs] = useState<string[]>([]);

  const handleMarkerDetected = (uri: string) => {
    setMarkers(prev => [uri, ...prev].slice(0, 20));
  };

  const handleScanLog = (line: string) => {
    const stamp = new Date().toLocaleTimeString();
    setScanLogs(prev => [`${stamp}  ${line}`, ...prev].slice(0, 80));
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <CameraScreen
          onMarkerDetected={handleMarkerDetected}
          onStatusChange={setStatus}
          onScanLog={handleScanLog}
        />
      </View>

      <View style={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6, backgroundColor: '#f8fafc' }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: '#0f172a' }}>Status: {status}</Text>
        <Text style={{ marginTop: 4, color: '#334155' }}>Saved Markers: {markers.length}/20</Text>
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
            </View>
          )}
        />
      </View>

      <View style={{ maxHeight: 180, backgroundColor: '#f1f5f9', borderTopWidth: 1, borderTopColor: '#cbd5e1' }}>
        <Text
          style={{
            fontSize: 14,
            fontWeight: '700',
            color: '#0f172a',
            paddingHorizontal: 10,
            paddingTop: 8,
            paddingBottom: 4,
          }}
        >
          Scan Logs
        </Text>
        <FlatList
          data={scanLogs}
          keyExtractor={(item, idx) => `${idx}-${item}`}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 8 }}
          ListEmptyComponent={<Text style={{ color: '#64748b' }}>No logs yet.</Text>}
          renderItem={({ item }) => (
            <Text style={{ color: '#334155', fontSize: 12, marginBottom: 4 }}>{item}</Text>
          )}
        />
      </View>
    </View>
  );
}