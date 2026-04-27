import { CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';

const ROI_RATIO = 0.58;
const MAX_CAPTURE_SIDE = 3000;
const detectMarker = require('../utils/detectMarker').default;

export default function CameraScreen({ onMarkerDetected, onStatusChange }) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);

  const [isScanning, setIsScanning] = useState(false);
  const [feedback, setFeedback] = useState('idle');

  const statusMap = {
    idle: 'Ready',
    scanning: 'Scanning...',
    valid: 'Marker detected',
    invalid: 'Invalid marker',
  };

  const updateFeedback = (next) => {
    setFeedback(next);
    onStatusChange?.(statusMap[next] || next);
  };

  useEffect(() => {
    if (permission && permission.status === 'undetermined') {
      requestPermission();
    }
  }, [permission]);

  // ---------- PERMISSIONS ----------
  if (!permission) {
    return <View><Text>Checking camera permission...</Text></View>;
  }

  if (!permission.granted) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>Camera required</Text>
        <TouchableOpacity onPress={requestPermission}>
          <Text>Allow</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ---------- SCAN ----------
  const scan = async () => {
    if (!cameraRef.current || isScanning) return;

    setIsScanning(true);
    updateFeedback('scanning');

    try {
      // 1. Capture
      const photo = await cameraRef.current.takePictureAsync({
        quality: 1,
      });

      let workingImage = photo;

      // 2. Normalize size
      const longest = Math.max(photo.width, photo.height);
      if (longest > MAX_CAPTURE_SIDE) {
        workingImage = await ImageManipulator.manipulateAsync(
          photo.uri,
          [
            photo.width > photo.height
              ? { resize: { width: MAX_CAPTURE_SIDE } }
              : { resize: { height: MAX_CAPTURE_SIDE } },
          ],
          {}
        );
      }

      // 3. ROI crop
      const roiSize = Math.floor(
        Math.min(workingImage.width, workingImage.height) * ROI_RATIO
      );

      const roiImage = await ImageManipulator.manipulateAsync(
        workingImage.uri,
        [
          {
            crop: {
              originX: (workingImage.width - roiSize) / 2,
              originY: (workingImage.height - roiSize) / 2,
              width: roiSize,
              height: roiSize,
            },
          },
        ],
        {}
      );

      // 4. Detection
      const result = await detectMarker(roiImage.uri);

      if (!result.isValid) {
        updateFeedback('invalid');
        return;
      }

      // 5. Final crop → 300x300
      const rotateBy =
        typeof result?.rotationDegrees === 'number'
          ? result.rotationDegrees
          : ((result.rotation || 0) % 4) * 90;
      const ops = [];

      if (rotateBy !== 0) {
        ops.push({ rotate: rotateBy });
      }

      ops.push({ resize: { width: 300, height: 300 } });

      const final = await ImageManipulator.manipulateAsync(
        roiImage.uri,
        ops,
        {}
      );

      onMarkerDetected?.(final.uri);
      updateFeedback('valid');

    } catch (e) {
      console.log("Scan error:", e);
      updateFeedback('invalid');
    } finally {
      setIsScanning(false);
    }
  };

  // ---------- UI ----------
  const borderColor =
    feedback === 'valid'
      ? '#22c55e'
      : feedback === 'invalid'
      ? '#ef4444'
      : feedback === 'scanning'
      ? '#f59e0b'
      : '#ffffff';

  return (
    <View style={{ flex: 1 }}>

      {/* CAMERA */}
      <CameraView ref={cameraRef} style={{ flex: 1 }} />

      {/* OVERLAY */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <View
          style={{
            width: `${ROI_RATIO * 100}%`,
            aspectRatio: 1,
            borderWidth: 3,
            borderColor: borderColor,
            borderRadius: 12,
          }}
        />
        <Text style={{ color: '#fff', marginTop: 10 }}>
          Align marker
        </Text>
      </View>

      {/* SCAN BUTTON */}
      <View style={{ position: 'absolute', bottom: 30, width: '100%', alignItems: 'center' }}>
        <TouchableOpacity
          onPress={scan}
          disabled={isScanning}
          style={{
            backgroundColor: '#111',
            padding: 14,
            borderRadius: 30,
          }}
        >
          {isScanning ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: '#fff' }}>Scan</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}