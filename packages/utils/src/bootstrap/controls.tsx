import React, { HTMLInputTypeAttribute, memo } from 'react';

const lcFirst = (str) => str[0].toLowerCase() + str.substring(1, str.length);

const toProperty = (str) => lcFirst(str).split(' ').join('');

interface ControlProps {
    value?: any;
    setValue?: (v: any) => void;
    defaultValue?: any;
    options?: { [key: string]: any };
    setOptions?: (v: { [key: string]: any }) => void;
    defaultOptions?: { [key: string]: any };
    name: string;
    children?: React.ReactNode;
    inputProps?: {
        type: HTMLInputTypeAttribute;
        property?: string;
        valueExtractor?: (e: any) => any;
        className?: string;
    } & any;
    hideValue?: boolean;
}

type LabelProps = Pick<ControlProps, 'name' | 'value' | 'defaultValue'> & { reset: () => void };

const Label = memo<LabelProps>(function Label({ name, reset, value, defaultValue }) {
    return (
        <label className="flex-grow-1 mb-0 d-flex align-items-center justify-content-start gap-2">
            {name}
            {value !== defaultValue && (
                <>
                    <a href="javascript: void(0)" onClick={reset}>
                        <small>reset</small>
                    </a>
                </>
            )}
        </label>
    );
});

export const Control = memo<ControlProps>(function Control({
    value = null,
    setValue,
    defaultValue = null,
    options = {},
    setOptions,
    defaultOptions = {},
    name,
    inputProps: { Tag = 'input', property = 'value', valueExtractor = (e) => e.target.value, ...inputProps } = {},
    hideValue = false,
    children,
}) {
    const prop = toProperty(name);

    defaultValue = defaultValue || defaultOptions[prop];
    value = value || options?.[prop];
    setValue = setValue || ((v) => setOptions?.({ [prop]: v }));

    const reset = () => setValue(defaultValue);

    return (
        <div className="d-flex align-items-center gap-2">
            <Label name={name} reset={reset} value={value} defaultValue={defaultValue} />
            <Tag
                {...inputProps}
                {...{ [property]: value || '' }} // null is needed to make it always controlled
                className={`${value === defaultValue ? 'opacity-75' : ''} ${inputProps.className}`}
                onChange={(e) => setValue(valueExtractor(e))}
            >
                {children}
            </Tag>
            {!hideValue && (
                <span onDoubleClick={reset} className="text-start" style={{ width: '20px' }}>
                    {value}
                </span>
            )}
        </div>
    );
});

export interface RangeProps extends ControlProps {
    min: number;
    max: number;
    step?: number;
}

export const Range = memo<RangeProps>(function Range({ min, max, step = 0.1, ...props }) {
    return (
        <Control
            inputProps={{
                type: 'range',
                min,
                max,
                step,
                className: 'form-control-range',
                valueExtractor: (e) => parseFloat(e.target.value),
            }}
            {...props}
        />
    );
});

export const Checkbox = memo<ControlProps>(function Checkbox(props) {
    return (
        <Control
            inputProps={{ type: 'checkbox', property: 'checked', valueExtractor: (e) => e.target.checked }}
            {...props}
        />
    );
});

export const Select = memo<ControlProps>(function Select({ children, ...props }) {
    return (
        <Control inputProps={{ Tag: 'select', className: 'form-select' }} {...props} hideValue={true}>
            {children}
        </Control>
    );
});
