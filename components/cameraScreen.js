import { CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useRef } from 'react';
import { View, Button, Text, Linking } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import detectMarker from '../utils/detectMarker';

export default function CameraScreen({ setMarkers }) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);

  useEffect(() => {
    if (permission && permission.status === 'undetermined') {
      requestPermission();
    }
  }, [permission, requestPermission]);

  if (!permission) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>Checking camera permission...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    if (!permission.canAskAgain) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, gap: 12 }}>
          <Text>Camera permission is blocked. Open settings and allow camera access.</Text>
          <Button title="Open Settings" onPress={() => Linking.openSettings()} />
        </View>
      );
    }

    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, gap: 12 }}>
        <Text>Camera access is required to scan markers.</Text>
        <Button title="Allow Camera" onPress={requestPermission} />
      </View>
    );
  }

  const scan = async () => {
    const photo = await cameraRef.current.takePictureAsync();

    const small = await ImageManipulator.manipulateAsync(
      photo.uri,
      [{ resize: { width: 200 } }],
      {}
    );

    const isValid = await detectMarker(small.uri);

    if (isValid) {
      const final = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: 300, height: 300 } }],
        {}
      );

      setMarkers(prev => [...prev, final.uri]);
    } else {
      alert("Invalid marker");
    }
  };

  return (
    <CameraView ref={cameraRef} style={{ flex: 1 }}>
      <Button title="Scan" onPress={scan} />
    </CameraView>
  );
}