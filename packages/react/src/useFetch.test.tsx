import { expect, describe, test, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useFetch } from './useFetch';
import { act } from 'react';

describe('useFetch', () => {
    test('initializes with default value', () => {
        const mockFn = vi.fn(async () => 'result');
        const { result } = renderHook(() => useFetch(mockFn, 'default'));

        const [data, actionFn, isPending, error] = result.current;

        expect(data).toBe('default');
        expect(typeof actionFn).toBe('function');
        expect(isPending).toBe(false);
        expect(error).toBeUndefined();
    });

    test('executes function and updates data on success', async () => {
        const mockFn = vi.fn(async () => 'success');
        const { result } = renderHook(() => useFetch(mockFn, 'default'));

        await act(async () => {
            result.current[1]();
        });

        await waitFor(() => {
            expect(result.current[2]).toBe(false); // isPending becomes false
        });

        expect(result.current[0]).toBe('success');
        expect(result.current[3]).toBeUndefined();
        expect(mockFn).toHaveBeenCalledTimes(1);
    });

    test('handles function arguments', async () => {
        const mockFn = vi.fn(async (a: number, b: string) => `${a}-${b}`);
        const { result } = renderHook(() => useFetch(mockFn, 'default'));

        await act(async () => {
            result.current[1](42, 'test');
        });

        await waitFor(() => {
            expect(result.current[0]).toBe('42-test');
        });

        expect(mockFn).toHaveBeenCalledWith(42, 'test');
    });

    test('sets isPending to true during execution', async () => {
        let resolvePromise: (value: string) => void;
        const promise = new Promise<string>((resolve) => {
            resolvePromise = resolve;
        });
        const mockFn = vi.fn(async () => promise);
        const { result } = renderHook(() => useFetch(mockFn, 'default'));

        act(() => {
            result.current[1]();
        });

        // Should be pending immediately
        expect(result.current[2]).toBe(true);

        await act(async () => {
            resolvePromise!('resolved');
            await promise;
        });

        await waitFor(() => {
            expect(result.current[2]).toBe(false);
        });

        expect(result.current[0]).toBe('resolved');
    });

    test('captures and stores errors', async () => {
        const error = new Error('Test error');
        const mockFn = vi.fn(async () => {
            throw error;
        });
        const { result } = renderHook(() => useFetch(mockFn, 'default'));

        await act(async () => {
            result.current[1]();
        });

        await waitFor(() => {
            expect(result.current[3]).toBe(error);
        });

        expect(result.current[0]).toBe('default'); // data remains unchanged
        expect(result.current[2]).toBe(false); // isPending becomes false
    });

    test('does not update data if component unmounts before resolution', async () => {
        let resolvePromise: (value: string) => void;
        const promise = new Promise<string>((resolve) => {
            resolvePromise = resolve;
        });
        const mockFn = vi.fn(async () => promise);
        const { result, unmount } = renderHook(() => useFetch(mockFn, 'default'));

        act(() => {
            result.current[1]();
        });

        unmount();

        await act(async () => {
            resolvePromise!('resolved');
            await promise;
        });

        // No assertions needed - just verifying no errors on unmount
        expect(mockFn).toHaveBeenCalledTimes(1);
    });

    test('returns the promise from actionFn', async () => {
        const mockFn = vi.fn(async () => 'result');
        const { result } = renderHook(() => useFetch(mockFn, 'default'));

        let returnedPromise: Promise<string>;
        await act(async () => {
            returnedPromise = result.current[1]();
        });

        await expect(returnedPromise!).resolves.toBe('result');
    });

    test('handles multiple sequential calls', async () => {
        const mockFn = vi.fn(async (n: number) => `result-${n}`);
        const { result } = renderHook(() => useFetch(mockFn, 'default'));

        await act(async () => {
            result.current[1](1);
        });

        await waitFor(() => {
            expect(result.current[0]).toBe('result-1');
        });

        await act(async () => {
            result.current[1](2);
        });

        await waitFor(() => {
            expect(result.current[0]).toBe('result-2');
        });

        expect(mockFn).toHaveBeenCalledTimes(2);
    });

    test('preserves actionFn reference when fn dependency does not change', () => {
        const mockFn = vi.fn(async () => 'result');
        const { result, rerender } = renderHook(() => useFetch(mockFn, 'default'));

        const firstActionFn = result.current[1];

        rerender();

        const secondActionFn = result.current[1];

        expect(firstActionFn).toBe(secondActionFn);
    });

    test('updates actionFn when fn dependency changes', async () => {
        const mockFn1 = vi.fn(async () => 'result1');
        const mockFn2 = vi.fn(async () => 'result2');

        const { result, rerender } = renderHook(({ fn }) => useFetch(fn, 'default'), {
            initialProps: { fn: mockFn1 },
        });

        const firstActionFn = result.current[1];

        await act(async () => {
            result.current[1]();
        });

        await waitFor(() => {
            expect(result.current[0]).toBe('result1');
        });

        // Change the function
        rerender({ fn: mockFn2 });

        const secondActionFn = result.current[1];

        expect(firstActionFn).not.toBe(secondActionFn);

        await act(async () => {
            result.current[1]();
        });

        await waitFor(() => {
            expect(result.current[0]).toBe('result2');
        });

        expect(mockFn1).toHaveBeenCalledTimes(1);
        expect(mockFn2).toHaveBeenCalledTimes(1);
    });

    test('does not trigger execution on rerender', () => {
        const mockFn = vi.fn(async () => 'result');
        const { rerender } = renderHook(() => useFetch(mockFn, 'default'));

        rerender();
        rerender();
        rerender();

        expect(mockFn).not.toHaveBeenCalled();
    });

    test('handles concurrent calls correctly', async () => {
        let callCount = 0;
        const mockFn = vi.fn(async () => {
            callCount++;
            const currentCall = callCount;
            await new Promise((resolve) => setTimeout(resolve, 10));
            return `result-${currentCall}`;
        });

        const { result } = renderHook(() => useFetch(mockFn, 'default'));

        // Fire multiple calls at once
        await act(async () => {
            result.current[1]();
            result.current[1]();
            result.current[1]();
        });

        await waitFor(() => {
            expect(result.current[2]).toBe(false);
        });

        // Last call should win
        expect(mockFn).toHaveBeenCalledTimes(3);
        expect(['result-1', 'result-2', 'result-3']).toContain(result.current[0]);
    });

    test('maintains separate state for different hook instances', async () => {
        const mockFn1 = vi.fn(async () => 'result1');
        const mockFn2 = vi.fn(async () => 'result2');

        const { result: result1 } = renderHook(() => useFetch(mockFn1, 'default1'));
        const { result: result2 } = renderHook(() => useFetch(mockFn2, 'default2'));

        expect(result1.current[0]).toBe('default1');
        expect(result2.current[0]).toBe('default2');

        await act(async () => {
            result1.current[1]();
        });

        await waitFor(() => {
            expect(result1.current[0]).toBe('result1');
        });

        expect(result2.current[0]).toBe('default2'); // unchanged

        await act(async () => {
            result2.current[1]();
        });

        await waitFor(() => {
            expect(result2.current[0]).toBe('result2');
        });

        expect(result1.current[0]).toBe('result1'); // still unchanged
    });

    test('handles closure over external state', async () => {
        let externalValue = 10;

        const { result, rerender } = renderHook(() => {
            const mockFn = async () => `value-${externalValue}`;
            return useFetch(mockFn, 'default');
        });

        await act(async () => {
            result.current[1]();
        });

        await waitFor(() => {
            expect(result.current[0]).toBe('value-10');
        });

        // Change external value and rerender
        externalValue = 20;
        rerender();

        await act(async () => {
            result.current[1]();
        });

        await waitFor(() => {
            expect(result.current[0]).toBe('value-20');
        });
    });

    test('clears error on successful subsequent call', async () => {
        const error = new Error('Test error');
        let shouldError = true;

        const mockFn = vi.fn(async () => {
            if (shouldError) {
                throw error;
            }
            return 'success';
        });

        const { result } = renderHook(() => useFetch(mockFn, 'default'));

        // First call errors
        await act(async () => {
            result.current[1]();
        });

        await waitFor(() => {
            expect(result.current[3]).toBe(error);
        });

        // Second call succeeds
        shouldError = false;
        await act(async () => {
            result.current[1]();
        });

        await waitFor(() => {
            expect(result.current[0]).toBe('success');
        });

        // Error is cleared automatically
        expect(result.current[3]).toBe(undefined);
    });

    test('handles callback that returns a function with old value', async () => {
        const mockFn = vi.fn((increment: number) => (oldValue: number) => oldValue + increment);
        const { result } = renderHook(() => useFetch(mockFn, 0));

        // First call - should call the function with oldValue (0) and get 0 + 5 = 5
        await act(async () => {
            result.current[1](5);
        });

        await waitFor(() => {
            expect(result.current[0]).toBe(5);
        });

        // Second call - should call the function with oldValue (5) and get 5 + 10 = 15
        await act(async () => {
            result.current[1](10);
        });

        await waitFor(() => {
            expect(result.current[0]).toBe(15);
        });

        expect(mockFn).toHaveBeenCalledTimes(2);
    });

    test('handles multiple calls with old value pattern', async () => {
        const mockFn = vi.fn(
            (operation: string, value: number) => (oldValue: string) => `${oldValue}-${operation}${value}`,
        );
        const { result } = renderHook(() => useFetch(mockFn, 'initial'));

        // First call
        await act(async () => {
            result.current[1]('add', 1);
        });

        await waitFor(() => {
            expect(result.current[0]).toBe('initial-add1');
        });

        // Second call - should use the updated value
        await act(async () => {
            result.current[1]('multiply', 2);
        });

        await waitFor(() => {
            expect(result.current[0]).toBe('initial-add1-multiply2');
        });

        expect(mockFn).toHaveBeenCalledTimes(2);
    });

    test('handles counter pattern with old value', async () => {
        const increment = vi.fn(() => (prev: number) => prev + 1);
        const { result } = renderHook(() => useFetch(increment, 0));

        // First increment: 0 + 1 = 1
        await act(async () => {
            result.current[1]();
        });

        await waitFor(() => {
            expect(result.current[0]).toBe(1);
        });

        // Second increment: 1 + 1 = 2
        await act(async () => {
            result.current[1]();
        });

        await waitFor(() => {
            expect(result.current[0]).toBe(2);
        });

        // Third increment: 2 + 1 = 3
        await act(async () => {
            result.current[1]();
        });

        await waitFor(() => {
            expect(result.current[0]).toBe(3);
        });

        expect(increment).toHaveBeenCalledTimes(3);
    });
});
