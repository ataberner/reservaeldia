import { useCallback } from 'react';
import { getStorage, ref, getDownloadURL, uploadBytes, deleteObject } from 'firebase/storage';
import { v4 as uuidv4 } from 'uuid';

export const useFirebaseStorage = () => {
  const storage = getStorage();

  const getImageUrl = useCallback(async (path, userId) => {
    if (!path || !userId) return null;
    
    try {
      const imagePath = `users/${userId}/images/${path}`;
      const imageRef = ref(storage, imagePath);
      const url = await getDownloadURL(imageRef);
      return url;
    } catch (error) {
      console.error('Error al obtener URL de imagen:', error);
      // Si el error es porque el archivo no existe, retornamos null en lugar de lanzar el error
      if (error.code === 'storage/object-not-found') {
        return null;
      }
      throw error;
    }
  }, [storage]);

  const uploadImage = useCallback(async (file, userId) => {
    if (!file || !userId) {
      throw new Error('Se requiere archivo y userId para subir una imagen');
    }

    try {
      const fileName = `${uuidv4()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const imagePath = `users/${userId}/images/${fileName}`;
      const imageRef = ref(storage, imagePath);
      
      await uploadBytes(imageRef, file);
      const url = await getDownloadURL(imageRef);
      
      return {
        url,
        path: fileName
      };
    } catch (error) {
      console.error('Error al subir imagen:', error);
      throw new Error(`Error al subir imagen: ${error.message}`);
    }
  }, [storage]);

  const deleteImage = useCallback(async (path, userId) => {
    if (!path || !userId) return;

    try {
      const imagePath = `users/${userId}/images/${path}`;
      const imageRef = ref(storage, imagePath);
      await deleteObject(imageRef);
    } catch (error) {
      console.error('Error al eliminar imagen:', error);
      // Si el archivo ya no existe, no lanzamos error
      if (error.code !== 'storage/object-not-found') {
        throw new Error(`Error al eliminar imagen: ${error.message}`);
      }
    }
  }, [storage]);

  return {
    getImageUrl,
    uploadImage,
    deleteImage
  };
}; 