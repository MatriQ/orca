import { describe, expect, it } from 'vitest'
import { ANTIGRAVITY_ACP_DIALECT } from './antigravity-dialect'

const writeIn = (title: string) => ({
  type: 'string',
  title: 'Other',
  description: `Optional free-form answer to: ${title}`
})

// Shape captured from the server's ask_question when the client advertises form elicitation.
const singleQuestion = {
  sessionId: 's1',
  toolCallId: 'call_1',
  mode: 'form',
  message: 'The agent has a question.',
  requestedSchema: {
    type: 'object',
    properties: {
      q1: {
        type: 'string',
        title: 'Pick a color',
        oneOf: [
          { const: '1', title: 'Red' },
          { const: '2', title: 'Blue' }
        ]
      },
      q1_other: writeIn('Pick a color')
    }
  }
}

function present(params: unknown) {
  const presentation = ANTIGRAVITY_ACP_DIALECT.request?.('elicitation/create', params)
  if (!presentation) {
    throw new Error('expected a question presentation')
  }
  return presentation
}

describe('Antigravity ask_question forms', () => {
  it('advertises form elicitation so questions arrive with write-in fields', () => {
    expect(ANTIGRAVITY_ACP_DIALECT.clientCapabilities?.elicitation?.form).toEqual({})
  })

  it('shows the question with a write-in field and returns typed text as the answer', () => {
    const { body, reply } = present(singleQuestion)
    expect(body).toMatchObject({
      kind: 'question',
      question: 'Pick a color',
      options: [
        { id: 'o1', label: 'Red' },
        { id: 'o2', label: 'Blue' }
      ],
      freeTextQuestionId: 'q1'
    })
    expect(
      reply({
        kind: 'answers',
        answers: [{ questionId: 'q1', optionIds: [], other: 'Green please' }]
      })
    ).toEqual({ action: 'accept', content: { q1_other: 'Green please' } })
    expect(reply({ kind: 'option', optionId: 'o2' })).toEqual({
      action: 'accept',
      content: { q1: '2' }
    })
    expect(reply(null)).toEqual({ action: 'cancel' })
  })

  it('keeps a write-in per question in multi-question forms', () => {
    const { body, reply } = present({
      ...singleQuestion,
      message: 'The agent has 2 questions.',
      requestedSchema: {
        type: 'object',
        properties: {
          ...singleQuestion.requestedSchema.properties,
          q2: {
            type: 'array',
            title: 'Pick toppings',
            items: {
              anyOf: [
                { const: '1', title: 'Cheese' },
                { const: '2', title: 'Ham' }
              ]
            }
          },
          q2_other: writeIn('Pick toppings')
        }
      }
    })
    expect(body.kind === 'question' ? body.questions : undefined).toMatchObject([
      { id: 'q1', question: 'Pick a color', freeTextQuestionId: 'q1' },
      { id: 'q2', question: 'Pick toppings', multiSelect: true, freeTextQuestionId: 'q2' }
    ])
    expect(
      reply({
        kind: 'answers',
        answers: [
          { questionId: 'q1', optionIds: ['o1'] },
          { questionId: 'q2', optionIds: ['o1', 'o2'], other: 'olives' }
        ]
      })
    ).toEqual({ action: 'accept', content: { q1: '1', q2: ['1', '2'], q2_other: 'olives' } })
  })

  it('leaves other forms, such as forwarded MCP requests, to the shared presentation', () => {
    expect(
      ANTIGRAVITY_ACP_DIALECT.request?.('elicitation/create', {
        ...singleQuestion,
        message: 'Choose a deployment target'
      })
    ).toBeUndefined()
  })
})
