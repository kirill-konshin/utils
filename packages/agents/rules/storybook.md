---
type: always_apply
description: Set of rules for projects which use Storybook
paths:
    - '**/*.stories.tsx'
---

- Story files: `*.stories.tsx`

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ComponentName } from './componentName';

const meta: Meta<typeof ComponentName> = {
    title: 'Category / ComponentName',
    component: ComponentName,
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
    argTypes: {
        // control definitions
    },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

// Export presets with args
export const WithArgs: Story = {
    args: {
        // props
    },
};
```
