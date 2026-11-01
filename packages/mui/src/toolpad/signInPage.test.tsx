/**
 * @vitest-environment jsdom
 */
import React from 'react';

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vite-plus/test';

import { SignInPage } from './signInPage';

const PROVIDERS = [{ id: 'credentials', name: 'password' }];

/** The error Next.js rejects a Server Action call with while it follows the action's `redirect()`. */
const redirectError = (): Error =>
    Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;replace;/admin;307;' });

const submit = async () => {
    const form = document.querySelector('form')!;
    await act(async () => {
        fireEvent.submit(form);
    });
    return form;
};

afterEach(cleanup);

test('SignInPage turns off browser validation, which fights the server errors', () => {
    render(<SignInPage providers={PROVIDERS} signIn={vi.fn()} />);

    expect(document.querySelector('form')!.noValidate).toBe(true);
});

test('SignInPage shows the error signIn returns', async () => {
    render(<SignInPage providers={PROVIDERS} signIn={async () => ({ error: 'Wrong password' })} />);

    await submit();

    expect(await screen.findByText('Wrong password')).toBeTruthy();
});

test('SignInPage keeps waiting, without an unhandled rejection, when signIn redirects', async () => {
    const signIn = vi.fn(async () => {
        throw redirectError();
    });
    render(<SignInPage providers={PROVIDERS} signIn={signIn} />);

    await submit();

    expect(signIn).toHaveBeenCalledOnce();
    expect(screen.queryByText('NEXT_REDIRECT')).toBeNull();
});

test('SignInPage rethrows other errors of signIn', async () => {
    const error = new Error('Database is down');
    const signIn = vi.fn(async () => {
        throw error;
    });
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown) => rejections.push(reason);
    process.on('unhandledRejection', onRejection);

    render(<SignInPage providers={PROVIDERS} signIn={signIn} />);
    await submit();
    await new Promise((resolve) => setTimeout(resolve, 0));

    process.off('unhandledRejection', onRejection);
    expect(rejections).toContain(error);
});
