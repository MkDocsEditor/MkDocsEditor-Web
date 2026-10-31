/* eslint-disable vue/one-component-per-file -- two tiny test components */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent } from 'vue'

import { vFocusOnce } from './focusOnce'

const Field = defineComponent({
  directives: { focusOnce: vFocusOnce },
  props: { on: { type: Boolean, default: undefined } },
  template: '<div><label>x</label><input v-focus-once="on" /></div>',
})

const Wrapped = defineComponent({
  directives: { focusOnce: vFocusOnce },
  template: '<div v-focus-once><span /><input name="inner" /></div>',
})

describe('v-focus-once', () => {
  it('focuses the input when it shows, unless switched off', () => {
    const on = mount(Field, { attachTo: document.body })
    expect(document.activeElement).toBe(on.find('input').element)
    on.unmount()
    const off = mount(Field, { props: { on: false }, attachTo: document.body })
    expect(document.activeElement).not.toBe(off.find('input').element)
    off.unmount()
  })

  it('finds the input inside a component root', () => {
    const wrapper = mount(Wrapped, { attachTo: document.body })
    expect(document.activeElement).toBe(wrapper.find('input').element)
    wrapper.unmount()
  })
})
