import { useState } from 'react';
import { View, Image } from 'react-native';
import CameraScreen from '../../components/cameraScreen';

export default function Index() {
  const [markers, setMarkers] = useState<any[]>([]);

  return (
    <View style={{ flex: 1 }}>
      <CameraScreen setMarkers={setMarkers} />

      {markers.map((m, i) => (
        <Image
          key={i}
          source={{ uri: m }}
          style={{ width: 100, height: 100 }}
        />
      ))}
    </View>
  );
}