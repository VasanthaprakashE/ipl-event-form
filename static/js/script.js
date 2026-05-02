// Loader
window.onload = () => {
    setTimeout(() => {
        document.getElementById("loader").style.display = "none";
    }, 1500);
};

// Mobile validation
document.getElementById("mobile").addEventListener("input", function () {
    this.value = this.value.replace(/[^0-9]/g, "").slice(0, 10);
});

// Follow flow
let clicked = false;

document.getElementById("instaBtn").addEventListener("click", () => {
    if (clicked) return;
    clicked = true;

    document.getElementById("followQuestion").style.display = "block";
    document.getElementById("statusText").innerText =
        "Select Yes or No to continue";
});

function selectFollow(choice) {
    document.getElementById("followStatus").value = choice;

    let btn = document.getElementById("submitBtn");
    btn.disabled = false;
    btn.classList.add("active");
}