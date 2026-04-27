import { CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  ScrollView,
  Modal,
} from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';

const ROI_RATIO = 0.58;
const MAX_CAPTURE_SIDE = 3000;
const detectMarker = require('../utils/detectMarker').default;

export default function CameraScreen({ onMarkerDetected, onStatusChange, onScanLog }) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);

  const [isScanning, setIsScanning] = useState(false);
  const [feedback, setFeedback] = useState('idle');

  // 🔥 NEW: debug frames
  const [debugFrames, setDebugFrames] = useState([]);
  const [previewFrameIndex, setPreviewFrameIndex] = useState(-1);

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

  const pushLog = (msg) => {
    onScanLog?.(msg);
  };

  const closePreview = () => {
    setPreviewFrameIndex(-1);
  };

  const openPreview = (index) => {
    if (index >= 0 && index < debugFrames.length) {
      setPreviewFrameIndex(index);
    }
  };

  const showPrevPreview = () => {
    setPreviewFrameIndex((prev) => Math.max(0, prev - 1));
  };

  const showNextPreview = () => {
    setPreviewFrameIndex((prev) => Math.min(debugFrames.length - 1, prev + 1));
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
    pushLog('Scan started');
    closePreview();
    setDebugFrames([]);

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

      // 🔥 SHOW ROI
      setDebugFrames([
        {
          uri: roiImage.uri,
          label: 'ROI',
        },
      ]);

      // 4. Detection
      const result = await detectMarker(roiImage.uri);
      const loggedRotation =
        typeof result?.rotationDegrees === 'number'
          ? result.rotationDegrees
          : ((result?.rotation || 0) % 4) * 90;
      pushLog(`Detection result: valid=${result?.isValid ? 'yes' : 'no'} rotation=${loggedRotation}`);

      // 🔥 ADD DEBUG FRAMES
      if (result.frames) {
        setDebugFrames(prev => [...prev, ...result.frames]);
      }

      if (!result.isValid) {
        updateFeedback('invalid');
        pushLog('Marker rejected');
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
      pushLog('Marker accepted and saved (300x300)');

    } catch (e) {
      console.log("Scan error:", e);
      updateFeedback('invalid');
      pushLog(`Scan error: ${e?.message || 'unknown error'}`);
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

  const previewVisible = previewFrameIndex >= 0 && previewFrameIndex < debugFrames.length;
  const previewFrame = previewVisible ? debugFrames[previewFrameIndex] : null;

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

      {/* 🔥 DEBUG VISUAL PANEL */}
      <View
        style={{
          position: 'absolute',
          bottom: 100,
          width: '100%',
        }}
      >
        <ScrollView horizontal>
          {debugFrames.map((f, i) => (
            <TouchableOpacity key={i} style={{ margin: 5 }} onPress={() => openPreview(i)}>
              <Image
                source={{ uri: f.uri }}
                style={{ width: 100, height: 100 }}
              />
              <Text style={{ color: 'white', fontSize: 10 }}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <Modal
        visible={previewVisible}
        transparent
        animationType="fade"
        onRequestClose={closePreview}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.94)',
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: 14,
            paddingVertical: 24,
          }}
        >
          <TouchableOpacity
            onPress={closePreview}
            style={{
              position: 'absolute',
              top: 40,
              right: 20,
              backgroundColor: 'rgba(255,255,255,0.18)',
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 18,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>Close</Text>
          </TouchableOpacity>

          {previewFrame ? (
            <>
              <Image
                source={{ uri: previewFrame.uri }}
                resizeMode="contain"
                style={{ width: '94%', height: '72%' }}
              />
              <Text style={{ color: '#fff', marginTop: 10, fontSize: 16, fontWeight: '700' }}>
                {previewFrame.label}
              </Text>
              <Text style={{ color: '#cbd5e1', marginTop: 4 }}>
                {previewFrameIndex + 1}/{debugFrames.length}
              </Text>

              <View style={{ flexDirection: 'row', marginTop: 14 }}>
                <TouchableOpacity
                  onPress={showPrevPreview}
                  disabled={previewFrameIndex <= 0}
                  style={{
                    backgroundColor: previewFrameIndex <= 0 ? 'rgba(255,255,255,0.12)' : '#0f172a',
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    borderRadius: 10,
                    marginRight: 10,
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Prev</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={showNextPreview}
                  disabled={previewFrameIndex >= debugFrames.length - 1}
                  style={{
                    backgroundColor: previewFrameIndex >= debugFrames.length - 1 ? 'rgba(255,255,255,0.12)' : '#0f172a',
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    borderRadius: 10,
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Next</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}