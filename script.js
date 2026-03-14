let companies = [
{
name:"Recycling Jamaica Ltd",
price:50,
distance:3,
address:"Montego Bay",
phone:"876-555-1234"
},

{
name:"Eco Plastics",
price:40,
distance:5,
address:"St James",
phone:"876-555-8888"
},

{
name:"Green Island Recycling",
price:55,
distance:2,
address:"Green Island",
phone:"876-555-9999"
}
]

function startApp(){

show("upload")

}

function confirmImage(){

const file = document.getElementById("fileInput").files[0]

if(!file){
document.getElementById("error").innerText="Please upload an image."
return
}

document.getElementById("previewImage").src = URL.createObjectURL(file)

show("loading")

setTimeout(()=>{
show("results")
displayCompanies()
},2000)

}

function show(section){

document.querySelectorAll("section").forEach(s=>{
s.classList.remove("active")
})

document.getElementById(section).classList.add("active")

}

function displayCompanies(){

const container = document.getElementById("companyList")

container.innerHTML=""

companies.forEach(c=>{

container.innerHTML+=`

<div class="company">
<strong>${c.name}</strong><br>
Price: $${c.price}<br>
Address: ${c.address}<br>
Phone: ${c.phone}
</div>

`

})

}

function sortCompanies(){

let type = document.getElementById("sort").value

companies.sort((a,b)=>{

return a[type] - b[type]

})

displayCompanies()

}
