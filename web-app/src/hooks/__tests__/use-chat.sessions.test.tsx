import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai'
import { useChatSessions } from '@/stores/chat-session-store'
import { useChat } from '../use-chat'

const streams = vi.hoisted(() => ({
  requests: [] as Array<{ chatId: string; transportThreadId?: string; stream: ReadableStreamDefaultController<UIMessageChunk> }>,
}))

vi.mock('@/lib/custom-chat-transport', () => ({
  CustomChatTransport: class implements ChatTransport<UIMessage> {
    constructor(_system?: string, private threadId?: string) {}
    updateSystemMessage() {}
    setOnTokenUsage() {}
    refreshTools() {}
    setContinueFromContent() {}
    async updateRagToolsAvailability() {}
    async reconnectToStream() { return null }
    async sendMessages({ chatId }: { chatId: string }) {
      return new ReadableStream<UIMessageChunk>({
        start: (stream) => streams.requests.push({ chatId, transportThreadId: this.threadId, stream }),
      })
    }
  },
}))

beforeEach(() => {
  useChatSessions.getState().clearSessions()
  streams.requests.length = 0
})

describe('persistent chat sessions (#9311)', () => {
  it('continues a tool turn after switching away and uses fresh callbacks on return', async () => {
    const finishedA = vi.fn()
    const finishedB = vi.fn()
    const onReturn = vi.fn()
    const followUp = ({ messages }: { messages: UIMessage[] }) => {
      const parts = messages.at(-1)?.parts ?? []
      const last = parts.at(-1)
      return last?.type === 'tool-fetch' && last.state === 'output-available'
    }
    const { result, rerender, unmount } = renderHook(
      ({ id, onFinish }) => useChat({ sessionId: id, onFinish, sendAutomaticallyWhen: followUp }),
      { initialProps: { id: 'A', onFinish: finishedA } },
    )
    let sending!: Promise<void>
    act(() => { sending = result.current.sendMessage({ text: 'Use a tool' }) })
    await waitFor(() => expect(streams.requests).toHaveLength(1))
    const a = streams.requests[0]
    await act(async () => {
      a.stream.enqueue({ type: 'start', messageId: 'answer-A' })
      a.stream.enqueue({ type: 'tool-input-available', toolCallId: 'tool-A', toolName: 'fetch', input: {} })
      a.stream.enqueue({ type: 'finish', finishReason: 'tool-calls' })
      a.stream.close()
      await sending
    })
    expect(finishedA).toHaveBeenCalledOnce()

    rerender({ id: 'B', onFinish: finishedB })
    const sessionA = useChatSessions.getState().sessions.A
    await act(async () => {
      await sessionA.chat.addToolOutput({ tool: 'fetch', toolCallId: 'tool-A', output: 'tool result' })
    })
    await waitFor(() => expect(streams.requests).toHaveLength(2))
    const continuation = streams.requests[1]
    expect(continuation.chatId).toBe('A')
    expect(continuation.transportThreadId).toBe('A')
    expect(result.current.messages).toEqual([])

    rerender({ id: 'A', onFinish: onReturn })
    await act(async () => {
      continuation.stream.enqueue({ type: 'start', messageId: 'final-A' })
      continuation.stream.enqueue({ type: 'text-start', id: 'text-A' })
      continuation.stream.enqueue({ type: 'text-delta', id: 'text-A', delta: 'Final answer in A' })
      continuation.stream.enqueue({ type: 'text-end', id: 'text-A' })
      continuation.stream.enqueue({ type: 'finish', finishReason: 'stop' })
      continuation.stream.close()
    })
    await waitFor(() => expect(onReturn).toHaveBeenCalledOnce())
    expect(finishedA).toHaveBeenCalledOnce()
    expect(finishedB).not.toHaveBeenCalled()
    expect(result.current.messages.at(-1)?.parts).toContainEqual({ type: 'text', text: 'Final answer in A', state: 'done' })

    // B must also get its own transport when first opened from an existing A.
    rerender({ id: 'B', onFinish: finishedB })
    act(() => { sending = result.current.sendMessage({ text: 'Hi B' }) })
    await waitFor(() => expect(streams.requests).toHaveLength(3))
    expect(streams.requests[2].transportThreadId).toBe('B')
    await act(async () => {
      streams.requests[2].stream.enqueue({ type: 'finish', finishReason: 'stop' })
      streams.requests[2].stream.close()
      await sending
    })
    unmount()
  })
})
