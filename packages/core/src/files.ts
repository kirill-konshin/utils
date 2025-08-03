export const downloadFile = async (file: File): Promise<void> => {
    //FIXME https://github.com/eligrey/FileSaver.js/issues/471
    const { saveAs } = require('file-saver');

    //FIXME https://github.com/eligrey/FileSaver.js/issues/731
    return saveAs(file, file.name);
};

export const createFile = async (text: any, filename = 'file.json', type = 'application/json'): Promise<File> => {
    return new File([new Blob([text], { type })], filename);
};

export const openFile = (): Promise<string> =>
    new Promise((res, rej) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.addEventListener('change', function readFile(e) {
            input.removeEventListener('change', readFile);
            // @ts-expect-error file is always there
            const [file] = e.target.files;
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => res(e.target?.result as string);
            reader.onerror = rej;
            reader.onabort = rej;
            reader.readAsText(file);
        });
        input.click();
    });
