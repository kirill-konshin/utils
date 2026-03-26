# MUI Classes In Selectors

Always use following notation because it's the only one that works with minification:

```tsx
import Input, { inputClasses } from '@mui/material/Input';

const cmp = (
    <Box
        sx={{
            [`& .${inputClasses.root}`]: {
                // styles
            },
        }}
    >
        <Input />
    </Box>
);
```
