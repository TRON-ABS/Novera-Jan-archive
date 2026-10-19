import { describe, expect, it, vi } from 'vitest'
import { CustomChatTransport } from '../custom-chat-transport'

const state = vi.hoisted(() => {
  const modelA = { id: 'model-A', capabilities: ['tools'] }
  const modelB = { id: 'model-B' }
  return {
    modelA,
    modelB,
    provider: {
      selectedProvider: 'provider-B',
      selectedModel: modelB,
      getProviderByName: (name: string) => name === 'provider-A' ? { models: [modelA] } : undefined,
    },
    threads: { A: { model: { id: 'model-A', provider: 'provider-A' } } },
  }
})

vi.mock('@/hooks/useModelProvider', () => ({ useModelProvider: { getState: () => state.provider } }))
vi.mock('@/hooks/useThreads', () => ({ useThreads: { getState: () => ({ threads: state.threads }) } }))

class InspectableTransport extends CustomChatTransport {
  selection() { return this.getModelSelection() }
}

describe('background thread model selection (#9311)', () => {
  it('keeps A on its own model while B is selected on screen', () => {
    const transport = new InspectableTransport(undefined, 'A')
    expect(transport.selection()).toEqual({ selectedProvider: 'provider-A', selectedModel: state.modelA })
  })

  it('uses the current selector for a transport without a thread', () => {
    expect(new InspectableTransport().selection().selectedModel).toBe(state.modelB)
  })
})
