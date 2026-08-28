'use client'

import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { blobToDataUrl, compressImage, fileToDataUrl, normalizeRecordedAudioMime, sendConversationMessage } from './messagingComposerActions'
import { errorMessageFor, mergeMessagesById } from './messagingUtils'
import type { MessageView } from './types'
import type { ApiFetchLike } from './messagingData'

interface UseMessagingMediaArgs {
  apiFetch: ApiFetchLike
  activeId: string | null
  replyTo: { id: string } | null
  setReplyTo: (value: { id: string; senderName: string; preview: string } | null) => void
  setMessages: React.Dispatch<React.SetStateAction<MessageView[]>>
  refreshConversations: () => Promise<void>
  openConversation: (id: string) => void
  pushToast: (message: string) => void
  setBusy: React.Dispatch<React.SetStateAction<boolean>>
}

export function useMessagingMedia({
  apiFetch,
  activeId,
  replyTo,
  setReplyTo,
  setMessages,
  refreshConversations,
  openConversation,
  pushToast,
  setBusy,
}: UseMessagingMediaArgs) {
  const [photoPreview, setPhotoPreview] = useState<{ dataUrl: string; conversationId: string | null } | null>(null)
  const [photoPreviewPickedConv, setPhotoPreviewPickedConv] = useState<string | null>(null)
  const [showCamera, setShowCamera] = useState(false)
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isRecordingPaused, setIsRecordingPaused] = useState(false)
  const [recordDuration, setRecordDuration] = useState(0)

  const activeIdRef = useRef(activeId)
  useEffect(() => {
    activeIdRef.current = activeId
  }, [activeId])
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pressStartRef = useRef(0)
  const wasHoldingRef = useRef(false)
  const shouldSendRef = useRef(true)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const cameraStreamRef = useRef<MediaStream | null>(null)

  function openAttachMenu() {
    setShowAttachMenu((v) => !v)
  }

  function closeAttachMenu() {
    setShowAttachMenu(false)
  }

  async function handlePhotoFileChange(e: ChangeEvent<HTMLInputElement>, targetConversationId: string | null) {
    const file = e.target.files?.[0]
    e.target.value = ''
    setShowAttachMenu(false)
    if (!file) return
    const dataUrl = await fileToDataUrl(file)
    setPhotoPreview({ dataUrl, conversationId: targetConversationId })
    setPhotoPreviewPickedConv(targetConversationId)
  }

  async function openCamera() {
    setShowAttachMenu(false)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      cameraStreamRef.current = stream
      setShowCamera(true)
      setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = stream
      }, 0)
    } catch {
      pushToast("Impossible d'accéder à la caméra.")
    }
  }

  function closeCamera() {
    cameraStreamRef.current?.getTracks().forEach((t) => t.stop())
    cameraStreamRef.current = null
    setShowCamera(false)
  }

  function capturePhoto() {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
    closeCamera()
    setPhotoPreview({ dataUrl, conversationId: activeId })
    setPhotoPreviewPickedConv(activeId)
  }

  async function handleSendPhoto() {
    const targetId = photoPreview?.conversationId ?? photoPreviewPickedConv
    if (!photoPreview || !targetId) return
    setBusy(true)
    try {
      const compressed = await compressImage(photoPreview.dataUrl)
      const res = await sendConversationMessage(apiFetch, targetId, {
        type: 'image',
        content: '',
        mediaDataUri: compressed,
        replyToMessageId: targetId === activeId ? (replyTo?.id ?? undefined) : undefined,
      })
      if (!res.ok) {
        pushToast(errorMessageFor(res.error))
      } else {
        setPhotoPreview(null)
        if (targetId === activeId) {
          setMessages((prev) => mergeMessagesById(prev, [res.data.message]))
          setReplyTo(null)
        } else {
          openConversation(targetId)
        }
        await refreshConversations()
      }
    } finally {
      setBusy(false)
    }
  }

  async function startRecording() {
    if (!activeId || mediaRecorderRef.current?.state === 'recording') return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t)) || ''
      const mr = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      audioChunksRef.current = []
      shouldSendRef.current = true
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        if (recordTimerRef.current) clearInterval(recordTimerRef.current)
        setRecordDuration(0)
        setIsRecording(false)
        setIsRecordingPaused(false)
        if (shouldSendRef.current && audioChunksRef.current.length > 0) {
          const actualMime = normalizeRecordedAudioMime(mr.mimeType)
          const blob = new Blob(audioChunksRef.current, { type: actualMime })
          const dataUrl = await blobToDataUrl(blob)
          if (!activeIdRef.current) return
          const res = await sendConversationMessage(apiFetch, activeIdRef.current, {
            type: 'voice',
            content: '',
            mediaDataUri: dataUrl,
            replyToMessageId: replyTo?.id ?? undefined,
          })
          if (!res.ok) pushToast(errorMessageFor(res.error))
          else {
            setMessages((prev) => mergeMessagesById(prev, [res.data.message]))
            setReplyTo(null)
            await refreshConversations()
          }
        }
      }
      mr.start()
      mediaRecorderRef.current = mr
      setIsRecording(true)
      setIsRecordingPaused(false)
      setRecordDuration(0)
      if (recordTimerRef.current) clearInterval(recordTimerRef.current)
      recordTimerRef.current = setInterval(() => setRecordDuration((d) => d + 1), 1000)
    } catch {
      pushToast('Impossible d’accéder au micro.')
    }
  }

  function stopRecording(send: boolean) {
    shouldSendRef.current = send
    const mr = mediaRecorderRef.current
    if (mr && mr.state !== 'inactive') mr.stop()
    mediaRecorderRef.current = null
  }

  function toggleRecordingPause() {
    const mr = mediaRecorderRef.current
    if (!mr) return
    if (mr.state === 'recording') {
      mr.pause()
      setIsRecordingPaused(true)
      if (recordTimerRef.current) clearInterval(recordTimerRef.current)
      recordTimerRef.current = null
    } else if (mr.state === 'paused') {
      mr.resume()
      setIsRecordingPaused(false)
      recordTimerRef.current = setInterval(() => setRecordDuration((duration) => duration + 1), 1000)
    }
  }

  function handleMicPointerDown() {
    pressStartRef.current = Date.now()
    wasHoldingRef.current = false
    holdTimerRef.current = setTimeout(() => {
      wasHoldingRef.current = true
      void startRecording()
    }, 250)
  }

  function handleMicPointerUp() {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current)
    const pressDuration = Date.now() - pressStartRef.current
    if (pressDuration < 250 && !wasHoldingRef.current) {
      if (mediaRecorderRef.current?.state === 'recording') stopRecording(true)
      else void startRecording()
    } else if (wasHoldingRef.current) {
      stopRecording(true)
    }
  }

  return {
    photoPreview,
    setPhotoPreview,
    photoPreviewPickedConv,
    setPhotoPreviewPickedConv,
    showCamera,
    showAttachMenu,
    isRecording,
    isRecordingPaused,
    recordDuration,
    videoRef,
    openAttachMenu,
    closeAttachMenu,
    handlePhotoFileChange,
    openCamera,
    closeCamera,
    capturePhoto,
    handleSendPhoto,
    handleMicPointerDown,
    handleMicPointerUp,
    stopRecording,
    toggleRecordingPause,
  }
}
