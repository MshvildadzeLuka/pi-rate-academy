const { google } = require('googleapis');
const stream = require('stream');

const SCOPES = ['https://www.googleapis.com/auth/drive'];

async function authorize() {
    const auth = new google.auth.GoogleAuth({
        keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
        scopes: SCOPES,
    });
    return await auth.getClient();
}

async function uploadFileToDrive(fileObject) {
    const authClient = await authorize();
    const bufferStream = new stream.PassThrough();
    bufferStream.end(fileObject.buffer);

    const drive = google.drive({ version: 'v3', auth: authClient });

    try {
        // Upload to the specific folder
        const { data } = await drive.files.create({
            media: {
                mimeType: fileObject.mimetype,
                body: bufferStream,
            },
            requestBody: {
                name: fileObject.originalname,
                parents: [process.env.GOOGLE_DRIVE_FOLDER_ID], // Use the folder ID
            },
            fields: 'id, webViewLink, webContentLink',
        });

        // Make the file publicly viewable
        await drive.permissions.create({
            fileId: data.id,
            requestBody: {
                role: 'reader',
                type: 'anyone',
            },
        });

        return {
            id: data.id,
            link: data.webViewLink,
            downloadLink: data.webContentLink
        };
    } catch (error) {
        console.error('Google Drive API Error Details:', error.response?.data || error.message);
        throw new Error('Failed to upload file to Google Drive: ' + (error.response?.data?.error?.message || error.message));
    }
}

async function deleteFileFromDrive(fileId) {
    const authClient = await authorize();
    const drive = google.drive({ version: 'v3', auth: authClient });

    try {
        await drive.files.delete({
            fileId: fileId,
        });
        return true;
    } catch (error) {
        console.error('Google Drive API Error:', error.response?.data || error.message);
        throw new Error('Failed to delete file from Google Drive: ' + (error.response?.data?.error?.message || error.message));
    }
}

module.exports = { uploadFileToDrive, deleteFileFromDrive };