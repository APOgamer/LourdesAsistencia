window.showNotification = function(message, isSuccess = true) {
    Toastify({
        text: message,
        duration: 3000,
        gravity: "top",
        position: "right",
        style: {
            background: isSuccess ? "#4CAF50" : "#f44336",
            borderRadius: "8px",
            boxShadow: "0 2px 5px rgba(0,0,0,0.2)"
        }
    }).showToast();
}

window.normalizarSeccion = function(seccion) {
    if (!seccion) return '';
    // Eliminar caracteres especiales, espacios y comillas
    return seccion.trim()
        .replace(/[°º"]/g, '')  // Eliminar °, º y comillas
        .replace(/\s+/g, '')    // Eliminar espacios
        .replace(/["']/g, '')   // Eliminar cualquier tipo de comillas restantes
        .toUpperCase();
} 