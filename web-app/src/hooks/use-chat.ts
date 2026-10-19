import {
  CustomChatTransport,
  type ContinuationContent,
} from '@/lib/custom-chat-transport'
import {
  Chat,
  type UIMessage,
  type UseChatOptions,
  useChat as useChatSDK,
} from '@ai-sdk/react'
import {
  type ChatInit,
  type LanguageModelUsage,
} from 'ai'
import { useEffect, useMemo, useCallback } from 'react'
import { useChatSessions } from '@/stores/chat-session-store'
import { useAppState } from '@/hooks/useAppState'

type CustomChatOptions = Omit<ChatInit<UIMessage>, 'transport'> &
  Pick<UseChatOptions<UIMessage>, 'experimental_throttle' | 'resume'> & {
    sessionId?: string
    sessionTitle?: string
    systemMessage?: string
    onTokenUsage?: (usage: LanguageModelUsage, messageId: string) => void;
  }

// This is a wrapper around the AI SDK's useChat hook
// It implements model switching and uses the custom chat transport,
// making a nice reusable hook for chat functionality.
export function useChat(
  options?: CustomChatOptions
) {
  const {
    sessionId,
    sessionTitle,
    systemMessage,
    onTokenUsage,
    ...chatInitOptions
  } = options ?? {}
  const ensureSession = useChatSessions((state) => state.ensureSession)
  const setSessionTitle = useChatSessions((state) => state.setSessionTitle)
  const updateStatus = useChatSessions((state) => state.updateStatus)
  const getSessionData = useChatSessions((state) => state.getSessionData)

  // Get serviceHub and model metadata from app state
  const mcpToolNames = useAppState((state) => state.mcpToolNames)
  const ragToolNames = useAppState((state) => state.ragToolNames)

  // Never share a transport between threads: it carries the model and thread id.
  const transport = useMemo(() =>
    (sessionId && useChatSessions.getState().sessions[sessionId]?.transport) ||
      new CustomChatTransport(systemMessage, sessionId),
    // System instructions are refreshed below without replacing the transport.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionId]
  )
  const sessionData = sessionId ? getSessionData(sessionId) : undefined
  if (sessionData) sessionData.callbacks = chatInitOptions

  useEffect(() => {
    transport.updateSystemMessage(systemMessage)
  }, [systemMessage, transport])

  // Update the token usage callback when it changes
  useEffect(() => {
    transport.setOnTokenUsage(onTokenUsage)
  }, [onTokenUsage, transport])

  // Memoize to prevent calling ensureSession (which has side effects) on every render
  const chat = useMemo(() => {
    if (!sessionId || !sessionData) return undefined

    return ensureSession(
      sessionId,
      transport,
      () => new Chat({
        ...chatInitOptions,
        id: sessionId,
        transport,
        // The Chat survives navigation. Forward to this session's current view
        // callbacks on return, keeping the last ones while it runs off-screen.
        onFinish: (event) => sessionData.callbacks?.onFinish?.(event),
        onError: (error) => sessionData.callbacks?.onError?.(error),
        onToolCall: (event) => sessionData.callbacks?.onToolCall?.(event),
        onData: (data) => sessionData.callbacks?.onData?.(data),
        sendAutomaticallyWhen: (event) =>
          sessionData.callbacks?.sendAutomaticallyWhen?.(event) ?? false,
      }),
      sessionTitle
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, ensureSession])

  useEffect(() => {
    if (sessionId && sessionTitle) {
      setSessionTitle(sessionId, sessionTitle)
    }
  }, [sessionId, sessionTitle, setSessionTitle])

  const chatResult = useChatSDK({
    ...(chat
      ? { chat }
      : { transport, ...chatInitOptions }),
    experimental_throttle: options?.experimental_throttle,
    resume: false,
  })

  useEffect(() => {
    if (sessionId) {
      updateStatus(sessionId, chatResult.status)
    }
  }, [sessionId, chatResult.status, updateStatus])

  // Refresh tools when MCP or RAG tool names change (e.g., when MCP servers start/stop)
  useEffect(() => {
    if (transport) {
      // Use forceRefreshTools to update the transport's tool cache
      // This ensures the transport has the latest tools when MCP server status changes
      transport.refreshTools()
    }
  }, [mcpToolNames, ragToolNames, transport])

  const setContinueFromContent = useCallback(
    (content: string | ContinuationContent) => {
      transport.setContinueFromContent(content)
    },
    [transport]
  )

  // Expose method to update RAG tools availability
  const updateRagToolsAvailability = useCallback(
    async (
      hasDocuments: boolean,
      modelSupportsTools: boolean,
      ragFeatureAvailable: boolean
    ) => {
      if (transport) {
        await transport.updateRagToolsAvailability(
          hasDocuments,
          modelSupportsTools,
          ragFeatureAvailable
        )
      }
    },
    [transport]
  )

  return {
    ...chatResult,
    updateRagToolsAvailability,
    setContinueFromContent,
  }
}
