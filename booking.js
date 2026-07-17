(function () {
  function init() {
    const form = document.getElementById('reservation-form');
    const submitBtn = document.getElementById('submit-btn');
    const dateInput = document.getElementById('date');

    const successModal = document.getElementById('success-modal');
    const unavailableModal = document.getElementById('unavailable-modal');
    const errorModal = document.getElementById('error-modal');
    const successMessage = document.getElementById('success-message');
    const errorMessage = document.getElementById('error-message');

    const today = new Date().toISOString().split('T')[0];

    // The frontend and backend (server.js) are served by the same Render
    // app, so the API is always reachable at the page's own origin.
    const apiBaseUrl = window.location.origin;

    dateInput.min = today;

    function showModal(modal) {
      modal.classList.add('show');
      document.body.style.overflow = 'hidden';
    }

    function showSuccess(message) {
      successMessage.textContent = message;
      form.reset();
      dateInput.min = today;
      showModal(successModal);
    }

  function hideModal(modal) {
    modal.classList.remove('show');
    document.body.style.overflow = '';
  }

  function hideAllModals() {
    [successModal, unavailableModal, errorModal].forEach(hideModal);
  }

    document.querySelectorAll('[data-close-modal]').forEach((btn) => {
      btn.addEventListener('click', hideAllModals);
    });

    document.querySelectorAll('.modal-overlay').forEach((overlay) => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) hideAllModals();
      });
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const formData = new FormData(form);
    const payload = {
      name: formData.get('name'),
      phone: formData.get('phone'),
      email: formData.get('email'),
      date: formData.get('date'),
      time: formData.get('time'),
      guests: formData.get('guests')
    };

    submitBtn.disabled = true;
    submitBtn.textContent = 'Reserving...';

    try {
      const response = await fetch(`${apiBaseUrl}/api/reservations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (response.status === 409 || data.available === false) {
        showModal(unavailableModal);
        return;
      }

      if (!response.ok || !data.success) {
        errorMessage.textContent = data.message || 'Please try again later.';
        showModal(errorModal);
        return;
      }

      showSuccess(data.message);
    } catch (error) {
      errorMessage.textContent = 'Unable to connect to the server. Please make sure the server is running.';
      showModal(errorModal);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Request Reservation';
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
})();
