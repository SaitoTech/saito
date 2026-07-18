const SaitoPhotoCropperTemplate = (app, mod, image) => {
  return `
		<div class='saito-photo-cropper'>
			<div class="photo-cropper"> 
				<img id="imageToCrop" src="${image}">
			</div>
			<button id="cropButton" class="saito-button-primary">Crop Image</button>
		</div>`;
};

module.exports = SaitoPhotoCropperTemplate;
