import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { lastAssistantMessageIsCompleteWithToolCalls } from 'ai'
import { useChat } from '../use-chat'
import { useChatSessions } from '@/stores/chat-session-store'

// Opt-in test against the installed worker and the user's designated GGUF.
// No download, external provider, or conversation on disk is used.
vi.mock('@/lib/custom-chat-transport', () => ({
  CustomChatTransport: class {
    updateSystemMessage() {}
    setOnTokenUsage() {}
    refreshTools() {}
    async reconnectToStream() { return null }
    async sendMessages({ messages, abortSignal }: { messages: import('ai').UIMessage[]; abortSignal?: AbortSignal }) {
      const { streamText, convertToModelMessages, tool } = await import('ai')
      const { createOpenAICompatible } = await import('@ai-sdk/openai-compatible')
      const { z } = await import('zod')
      const provider = createOpenAICompatible({
        name: 'local-9311',
        baseURL: process.env.JAN_9311_MODEL_URL!,
        apiKey: process.env.JAN_9311_MODEL_KEY!,
        // jsdom's AbortSignal is a different realm from Node's native fetch.
        // Cancellation is covered by the route tests; this test completes both requests.
        fetch: (url, init) => fetch(url, { ...init, signal: undefined }),
      })
      const hasResult = messages.some((message) => message.parts.some((part) =>
        part.type === 'tool-fetch' && part.state === 'output-available',
      ))
      return streamText({
        model: provider.chatModel('Tron-9311'),
        messages: await convertToModelMessages(messages),
        tools: { fetch: tool({ description: 'Get the test value.', inputSchema: z.object({}) }) },
        toolChoice: hasResult ? 'none' : { type: 'tool', toolName: 'fetch' },
        maxOutputTokens: 2048,
        abortSignal,
        maxRetries: 0,
      }).toUIMessageStream()
    }
  },
}))

afterEach(() => useChatSessions.getState().clearSessions())

describe.skipIf(!process.env.JAN_9311_MODEL_URL)('Tron-v1-Q6_K live model (#9311)', () => {
  it('generates the final answer for A after a tool result arrives while viewing B', async () => {
    const onFinishA = vi.fn()
    const onFinishB = vi.fn()
    const onToolCall = vi.fn()
    const errors = vi.fn()
    const { result, rerender, unmount } = renderHook(
      ({ id, finish }) => useChat({
        sessionId: id,
        onFinish: finish,
        onToolCall,
        onError: errors,
        sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
      }),
      { initialProps: { id: 'live-A', finish: onFinishA } },
    )
    let pending!: Promise<void>
    act(() => { pending = result.current.sendMessage({ text: 'Call fetch, then report its result briefly.' }) })
    await act(async () => { await pending })
    expect(errors).not.toHaveBeenCalled()
    expect(onToolCall).toHaveBeenCalledOnce()
    const { toolCallId } = onToolCall.mock.calls[0][0].toolCall
    rerender({ id: 'live-B', finish: onFinishB })
    const sessionA = useChatSessions.getState().sessions['live-A']
    await act(async () => {
      await sessionA.chat.addToolOutput({ tool: 'fetch', toolCallId, output: 'The test value is 42.' })
    })
    await waitFor(() => expect(onFinishA).toHaveBeenCalledTimes(2), { timeout: 90000 })
    expect(errors).not.toHaveBeenCalled()
    expect(onFinishB).not.toHaveBeenCalled()
    expect(result.current.messages).toEqual([])
    const final = onFinishA.mock.calls[1][0].message
    expect(final.parts.some((part: { type: string; text?: string }) => part.type === 'text' && !!part.text?.trim())).toBe(true)
    rerender({ id: 'live-A', finish: onFinishA })
    expect(result.current.messages.at(-1)?.id).toBe(final.id)
    unmount()
  }, 150000)
})
