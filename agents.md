# Code Style

## Extracting props from other library components

```tsx
import React, { ComponentProps, FC } from 'react';
import Link, { LinkProps } from 'next/link'; // example component

export const AppLink: FC<
    LinkProps & ComponentProps<typeof Link> // if LinkProps are available prefer it, otherwise extract from Link (Link is used as example)
> = function AppLink({ href, children, ...props }) {
    return (
        <Link href={href} {...props}>
            {children}
        </Link>
    );
};
```

## Component Pattern

Prefer using memoized components:

```tsx
import { memo } from 'react';

export type CmpProps = {
    foo: string;
};

export const Cmp = memo<CmpProps>(function Cmp({ foo, ...props }) {
    // code here
});
```

If memo is not applicable:

```tsx
export type CmpProps = {
    foo: string;
};

export const Cmp: FC<CmpProps> = function Cmp({ foo, ...props }) {
    // code here
};
```

## Material UI Classes In Selectors

Always use following notation:

```tsx
import Input, { inputClasses } from '@mui/material/Input';

const cmp = <Box
            sx={{
                [`& .${inputClasses.root}`]: {
                    // styles
                },
            }}
        >
            <Input />
        </Box>
    );
};

```
