export const uploadToCloudinary = async (base64Image, cloudName, uploadPreset) => {
  try {
    const data = new FormData();
    data.append('file', `data:image/jpeg;base64,${base64Image}`);
    data.append('upload_preset', uploadPreset);
    data.append('cloud_name', cloudName);

    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: 'POST',
      body: data,
    });
    const result = await res.json();
    if (result.secure_url) {
      return result.secure_url;
    } else {
      throw new Error(result.error?.message || 'Failed to upload to Cloudinary');
    }
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw error;
  }
};
