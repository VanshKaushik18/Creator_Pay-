import './App.css'

function App() {
  

  return (
  <div className='grid grid-cols-5 h-screen text-center'>
    <div className='col-spam-1 bg-zinc-800'>
      

    </div>
    <div className='col-span-4 '>
      <div className='container h-130 text-center'>

      </div>
      <div className='bg-zinc-800 w-1/2 p-1 pr-7 text-white m-auto rounded-4xl border border-zinc-7
      00 flex h-16'>
        <input type="text" className='w-full h-full p-3 outline-none' placeholder='Need any help ?' />
        <button>Ask</button>
      </div>

    </div>

  </div>
  )
}

export default App
